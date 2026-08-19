import type { AuthChain } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import RequestError from './errors'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DEFAULT_CATALYST,
  DEFAULT_EXPIRATION,
  DEFAULT_MAX_CHAIN_LENGTH
} from './types'
import type { DecentralandSignatureData, VerifyAuthChainHeadersOptions } from './types'

function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

// Truncates user-supplied fragments echoed into error messages. Prevents unbounded
// growth of response bodies and limits the size of any attacker-controlled bytes
// that may appear in log lines or HTML-rendered error views.
function safe(value: unknown, max = 64): string {
  const s = typeof value === 'string' ? value : String(value ?? '')
  return s.length > max ? s.slice(0, max) + '…' : s
}

/**
 * Freezes the parsed metadata, nested objects included.
 *
 * `verify()` hands the same object to `metadataValidator` and to consumers, so the guarantee worth
 * having is not just "same object" but "same contents": a middleware that mutated it between the
 * two would leave the validation describing something the handler no longer sees. Services
 * authorize on nested fields (`realm.serverName`), so a shallow freeze would be a false assurance.
 *
 * Safe to recurse: the input comes from `JSON.parse`, which produces no cycles, getters or proxies.
 */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.freeze(value)
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key])
  }

  return value
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function isValidAuthLink(value: unknown): value is { type: string; payload: string; signature: string } {
  if (!value || typeof value !== 'object') return false
  const link = value as Record<string, unknown>
  return typeof link.type === 'string' && typeof link.payload === 'string' && typeof link.signature === 'string'
}

export function isEIP1654AuthChain(authChain: AuthChain): boolean {
  switch (authChain.length) {
    case 2:
    case 3:
      return authChain[0].type === AuthLinkType.SIGNER && authChain[1].type === AuthLinkType.ECDSA_EIP_1654_EPHEMERAL
    default:
      return false
  }
}

export function extractAuthChain(
  headers: Record<string, string | string[] | undefined>,
  maxChainLength: number = DEFAULT_MAX_CHAIN_LENGTH
): AuthChain {
  const chain: AuthChain = []
  for (let index = 0; index < maxChainLength; index++) {
    const raw = firstOf(headers[AUTH_CHAIN_HEADER_PREFIX + index])
    if (!raw) break

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      throw new RequestError(`Invalid chain format: ${safe(errorMessage(err))}`, 400)
    }

    if (!isValidAuthLink(parsed)) {
      throw new RequestError(`Invalid chain format: malformed auth link at position ${index}`, 400)
    }

    chain.push(parsed as AuthChain[number])
  }

  if (headers[AUTH_CHAIN_HEADER_PREFIX + maxChainLength]) {
    throw new RequestError(`Auth chain exceeds maximum length of ${maxChainLength}`, 400)
  }

  if (chain.length <= 1) {
    throw new RequestError(`Invalid Auth Chain`, 400)
  }

  return chain
}

export async function verifyPersonalSign(authChain: AuthChain, payload: string): Promise<string> {
  // SAFETY: `@dcl/crypto` types the third argument as HTTPProvider but accepts null at
  // runtime for personal-signature verification (no contract call needed). EIP-1654
  // chains — which do require a provider for contract-wallet validation — are routed
  // to `verifyEIP1654Sign` (catalyst-based) and never reach this path.
  const verification = await Authenticator.validateSignature(payload, authChain, null as never)

  if (!verification.ok) {
    throw new RequestError(`Invalid signature: ${verification.message}`, 401)
  }

  return Authenticator.ownerAddress(authChain).toLowerCase()
}

export async function verifyEIP1654Sign(
  authChain: AuthChain,
  payload: string,
  options: Pick<VerifyAuthChainHeadersOptions, 'catalyst' | 'fetcher'> = {}
): Promise<string> {
  const catalyst = new URL(options.catalyst ?? DEFAULT_CATALYST)
  const ownerAddress = Authenticator.ownerAddress(authChain).toLowerCase()
  const url = `${catalyst.origin}/lambdas/crypto/validate-signature`
  const init = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ authChain, timestamp: payload })
  }

  let response: {
    ok: boolean
    status: number
    text: () => Promise<string>
    body?: { cancel?: () => Promise<void> } | null
  }
  try {
    response = options.fetcher
      ? await options.fetcher.fetch(url, init as unknown as Parameters<typeof options.fetcher.fetch>[1])
      : await fetch(url, init)
  } catch (err) {
    throw new RequestError(`Error connecting to catalyst "${catalyst.origin}": ${errorMessage(err)}`, 503)
  }

  if (!response.ok) {
    // Release the response body (without reading it) before discarding the
    // response, so the undici socket isn't left checked out of the pool with its
    // bytes buffered until GC. Cancelling rather than reading keeps the rejection
    // independent of the body content.
    await response.body?.cancel?.().catch(() => undefined)
    throw new RequestError(`Catalyst "${catalyst.origin}" returned HTTP ${response.status}`, 503)
  }

  let verification: { ownerAddress: string; valid: boolean }
  try {
    const body = await response.text()
    const parsed = JSON.parse(body) as Record<string, unknown>
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.valid !== 'boolean' ||
      typeof parsed.ownerAddress !== 'string'
    ) {
      throw new Error('unexpected response shape')
    }
    verification = { ownerAddress: parsed.ownerAddress, valid: parsed.valid }
  } catch (err) {
    throw new RequestError(`Invalid response from catalyst "${catalyst.origin}": ${errorMessage(err)}`, 503)
  }

  if (!verification.valid || verification.ownerAddress.toLowerCase() !== ownerAddress) {
    throw new RequestError(`Invalid signature`, 401)
  }

  return ownerAddress
}

export function verifySign(
  authChain: AuthChain,
  payload: string,
  options: Pick<VerifyAuthChainHeadersOptions, 'catalyst' | 'fetcher'> = {}
): Promise<string> {
  if (isEIP1654AuthChain(authChain)) {
    return verifyEIP1654Sign(authChain, payload, options)
  }

  return verifyPersonalSign(authChain, payload)
}

export function verifyTimestamp(value?: string | string[]): number {
  const raw = firstOf(value)
  const timestamp = Number(raw || '0')
  if (raw && !Number.isFinite(timestamp)) {
    throw new RequestError(`Invalid chain timestamp: ${safe(raw)}`, 400)
  }

  return timestamp
}

export function verifyMetadata(value?: string | string[]): Record<string, unknown> {
  const raw = firstOf(value)
  let parsed: unknown
  try {
    parsed = JSON.parse(raw ?? '{}')
  } catch {
    throw new RequestError(`Invalid chain metadata: "${safe(raw)}"`, 400)
  }

  // Treat an explicit JSON `null` like a missing metadata header and fall back to an
  // empty object. This keeps callers migrating from @dcl/platform-crypto-middleware
  // (which returned `null` as-is) working, while still guaranteeing authMetadata is an
  // object that downstream code can safely dereference.
  if (parsed === null) {
    return {}
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError(`Invalid chain metadata: "${safe(raw)}"`, 400)
  }

  // Returned exactly as delivered. `createPayload` signs the metadata bytes verbatim, so any
  // difference between what was signed and what arrived — casing included — breaks signature
  // verification. There is nothing left for this function to canonicalize.
  return parsed as Record<string, unknown>
}

export function verifyExpiration(
  timestamp: number,
  options: Pick<VerifyAuthChainHeadersOptions, 'expiration'> = {}
): void {
  const expiration = options.expiration ?? DEFAULT_EXPIRATION
  const now = Date.now()
  if (timestamp + expiration < now) {
    throw new RequestError(
      `Expired signature: signature timestamp: ${timestamp}, timestamp expiration: ${
        timestamp + expiration
      }, local timestamp: ${now}`,
      401
    )
  }
  // Guard against timestamps that are so far in the future that the signature effectively
  // never expires. A legitimate signer's clock should not be more than one expiration
  // window ahead of the server.
  if (timestamp > now + expiration) {
    throw new RequestError(
      `Signature timestamp is too far in the future: signature timestamp: ${timestamp}, local timestamp: ${now}`,
      401
    )
  }
}

/**
 * Builds the payload the auth chain is signed over: the method, path and timestamp lowercased,
 * followed by the metadata joined verbatim.
 *
 * Lowercasing the metadata — which every signer did before this format — left its casing outside
 * the signature: `{"Signer":...}` and `{"signer":...}` produced byte-identical payloads, so a
 * rewritten property name kept a valid signature while reading as absent to consumers gating on
 * the exact key. Joining the raw bytes binds every metadata field, including consumer-defined
 * ones, to the signature.
 */
export function createPayload(
  method: string,
  path: string,
  rawTimestamp: string | string[] | undefined,
  rawMetadata: string | string[] | undefined
): string {
  const timestamp = firstOf(rawTimestamp)?.toLowerCase()
  return [method.toLowerCase(), path.toLowerCase(), timestamp, firstOf(rawMetadata)].join(':')
}

/**
 * Rebuilds the pre-6.0.0 payload: the whole joined string folded, metadata included.
 *
 * Kept beside {@link createPayload} on purpose — the two must stay in step, and the difference
 * between them is the entire migration.
 */
export function createLegacyPayload(
  method: string,
  path: string,
  rawTimestamp: string | string[] | undefined,
  rawMetadata: string | string[] | undefined
): string {
  return [method, path, firstOf(rawTimestamp), firstOf(rawMetadata)].join(':').toLowerCase()
}

/** Every own key that case-folds to `key`. More than one means the delivery is ambiguous. */
function foldedMatches(container: Record<string, unknown>, key: string): string[] {
  const folded = key.toLowerCase()
  return Object.keys(container).filter((candidate) => candidate.toLowerCase() === folded)
}

/**
 * The objects a path segment should be applied to.
 *
 * An array is flattened into its elements, nested arrays included, so a declared path like
 * `'items.sceneId'` reaches the objects inside `items` rather than stopping at the array and
 * silently guarding nothing. Anything that is not an object contributes nothing — the path simply
 * does not exist there, which is not an error.
 */
function objectsToInspect(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(objectsToInspect)
  }

  return value !== null && typeof value === 'object' ? [value as Record<string, unknown>] : []
}

/**
 * Rejects a `canonicalMetadataKeys` value that TypeScript would have caught but JavaScript will not.
 *
 * This ships as a published JS package. Left unchecked, `canonicalMetadataKeys: 'signer'` is truthy
 * with a non-zero length, and the guard would then iterate the string's characters as if they were
 * field paths — finding nothing, and enabling legacy verification with no protection at all.
 *
 * @throws Error when the option is not a non-empty array of non-empty dotted paths.
 */
function assertCanonicalKeysOption(keys: unknown): asserts keys is string[] {
  if (!Array.isArray(keys) || keys.length === 0) {
    throw new Error('canonicalMetadataKeys must be a non-empty array of metadata field paths')
  }

  for (const path of keys) {
    if (typeof path !== 'string' || path.length === 0) {
      throw new Error(`canonicalMetadataKeys entries must be non-empty strings, got: ${JSON.stringify(path)}`)
    }

    if (path.split('.').some((segment) => segment.length === 0)) {
      throw new Error(`canonicalMetadataKeys entries must not contain empty path segments, got: "${path}"`)
    }
  }
}

/**
 * Refuses legacy-signed metadata whose keys are not in the spelling the service declared.
 *
 * The legacy payload folds the metadata, so `{"Signer":...}` and `{"signer":...}` share one valid
 * signature. A service comparing `metadata.signer` reads the first as absent. Requiring the declared
 * spelling removes that ambiguity rather than resolving it, so nothing is rewritten.
 *
 * Only keys are checked. Values are guarded by whatever `metadataValidator` the service composes,
 * which runs on both paths — and requiring canonical values here would refuse legitimate traffic,
 * since fields such as `sceneId` carry case-sensitive CIDs.
 *
 * @param metadata - Parsed metadata, as delivered.
 * @param canonicalKeys - Declared spellings; dotted paths address nested fields.
 * @throws RequestError 400 when a delivered key case-folds to a declared one but differs from it.
 */
export function assertLegacyMetadataKeys(metadata: Record<string, unknown>, canonicalKeys: string[]): void {
  for (const declaredPath of canonicalKeys) {
    let containers: unknown[] = [metadata]

    for (const segment of declaredPath.split('.')) {
      const next: unknown[] = []

      for (const container of containers.flatMap(objectsToInspect)) {
        const delivered = foldedMatches(container, segment)
        if (delivered.length === 0) {
          continue
        }

        // More than one spelling folds to the same field, so which one the service reads depends on
        // key order rather than on anything the signature pinned. Refused as ambiguous, even when
        // one of them is spelled correctly.
        if (delivered.length > 1) {
          throw new RequestError(
            `Invalid chain metadata: "${safe(segment)}" delivered under ${delivered.length} spellings`,
            400
          )
        }

        if (delivered[0] !== segment) {
          throw new RequestError(
            `Invalid chain metadata: expected "${safe(segment)}", got "${safe(delivered[0])}"`,
            400
          )
        }

        next.push(container[segment])
      }

      if (next.length === 0) {
        break
      }

      containers = next
    }
  }
}

export default async function verify<P extends Record<string, unknown> = Record<string, unknown>>(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
  options: VerifyAuthChainHeadersOptions<P> = {}
): Promise<DecentralandSignatureData<P>> {
  // Read each header once; the timestamp and metadata are needed both for validation
  // and for the signed payload below.
  // Validated up front rather than on the legacy branch, so a misconfigured rollout fails on the
  // first request instead of on the first request that happens to need the fallback.
  if (options.canonicalMetadataKeys !== undefined) {
    assertCanonicalKeysOption(options.canonicalMetadataKeys)
  }

  const rawTimestamp = headers[AUTH_TIMESTAMP_HEADER]
  const rawMetadata = headers[AUTH_METADATA_HEADER]

  const authChain = extractAuthChain(headers, options.maxChainLength)
  const timestamp = verifyTimestamp(rawTimestamp)

  // Fail fast on expired signatures — avoids invoking a user-supplied metadataValidator
  // and the catalyst round-trip for replayed / stale requests.
  verifyExpiration(timestamp, options)

  // Frozen before the validator so neither it nor a downstream middleware can make the
  // authorization decision describe metadata the handler no longer sees.
  const metadata = deepFreeze(verifyMetadata(rawMetadata)) as P

  if (options.metadataValidator && !options.metadataValidator(metadata)) {
    throw new RequestError(`Invalid metadata content: ${safe(JSON.stringify(metadata))}`, 400)
  }

  let ownerAddress: string
  try {
    ownerAddress = await verifySign(authChain, createPayload(method, path, rawTimestamp, rawMetadata), options)
  } catch (err) {
    const canonicalKeys = options.canonicalMetadataKeys
    if (!canonicalKeys || !(err instanceof RequestError) || err.statusCode !== 401) {
      throw err
    }

    // Guarded before the second signature check, not after: the guard is free and the check may cost
    // a catalyst round-trip for an EIP-1654 chain. A request refused either way should not pay it.
    assertLegacyMetadataKeys(metadata, canonicalKeys)

    ownerAddress = await verifySign(authChain, createLegacyPayload(method, path, rawTimestamp, rawMetadata), options)
  }

  return {
    auth: ownerAddress,
    authMetadata: metadata
  }
}
