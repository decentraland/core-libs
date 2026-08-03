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

function safe(value: unknown, max = 64): string {
  const s = typeof value === 'string' ? value : String(value ?? '')
  return s.length > max ? s.slice(0, max) + '…' : s
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

  if (parsed === null) {
    return {}
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError(`Invalid chain metadata: "${safe(raw)}"`, 400)
  }

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
  if (timestamp > now + expiration) {
    throw new RequestError(
      `Signature timestamp is too far in the future: signature timestamp: ${timestamp}, local timestamp: ${now}`,
      401
    )
  }
}

export function createPayload(
  method: string,
  path: string,
  rawTimestamp: string | string[] | undefined,
  rawMetadata: string | string[] | undefined
): string {
  return [method, path, firstOf(rawTimestamp), firstOf(rawMetadata)].join(':').toLowerCase()
}

export default async function verify<P extends Record<string, unknown> = Record<string, unknown>>(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
  options: VerifyAuthChainHeadersOptions<P> = {}
): Promise<DecentralandSignatureData<P>> {
  const rawTimestamp = headers[AUTH_TIMESTAMP_HEADER]
  const rawMetadata = headers[AUTH_METADATA_HEADER]

  const authChain = extractAuthChain(headers, options.maxChainLength)
  const timestamp = verifyTimestamp(rawTimestamp)

  verifyExpiration(timestamp, options)

  const metadata = verifyMetadata(rawMetadata) as P

  if (options.metadataValidator && !options.metadataValidator(metadata)) {
    throw new RequestError(`Invalid metadata content: ${safe(JSON.stringify(metadata))}`, 400)
  }

  const payload = createPayload(method, path, rawTimestamp, rawMetadata)
  const ownerAddress = await verifySign(authChain, payload, options)

  return {
    auth: ownerAddress,
    authMetadata: metadata
  }
}
