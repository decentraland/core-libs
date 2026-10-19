import type { AuthChain } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import { parseClaim } from './claim'

// Header carrying the delegation on a signed request (base64 JSON `{ payload, signature }`).
export const SCOPE_HEADER = 'x-authoritative-scope'

// Upper bound on the scope header before base64-decoding and JSON.parse. A
// legitimate claim is a few hundred bytes; this caps work on attacker input.
export const MAX_SCOPE_HEADER_LENGTH = 4096

// Cap on a claim's remaining lifetime when the caller doesn't set `maxTtlMs`.
// The minter (sdk-multiplayer-server) issues 1h claims by default.
export const DEFAULT_MAX_TTL_MS = 2 * 60 * 60 * 1000

export type DelegationResult = { ok: true } | { ok: false; reason: string }

/** The scene the request targets, matched against the root-signed claim. */
export interface DelegationTarget {
  /** Service id of the verifier (`badges`, `storage`); the claim's `Audience` must equal it. */
  audience: string
  /** The request's recovered signer address (the ephemeral); any casing. */
  signer: string
  /** Target world; any casing. */
  world: string
  /** Target scene entity hash. */
  sceneId: string
  /** Target base parcel, `"x,y"`. */
  parcel: string
  /** Lowercased root addresses allowed to sign a claim. */
  trustedSigners: string[]
  /**
   * Cap on a claim's remaining lifetime: a claim expiring more than this many
   * millis from now is rejected. Bounds a leaked claim + ephemeral key
   * regardless of the TTL the minter chose. Defaults to `DEFAULT_MAX_TTL_MS`.
   * Anything but a finite positive number rejects every claim, so a
   * misconfigured value (e.g. `Number(undefined)`) fails closed.
   */
  maxTtlMs?: number
}

/**
 * Verify an authoritative scope delegation carried in `x-authoritative-scope`.
 *
 * A request is authorized when ALL hold:
 *  - exactly one header value is present,
 *  - the claim is well-formed and unexpired,
 *  - its audience == the verifier's (a claim minted for one service is never
 *    accepted by another),
 *  - its ephemeral == the request's actual signer (a captured claim can't be
 *    replayed with a different signing key),
 *  - its world, sceneId and parcel == the target's,
 *  - its expiration is within `maxTtlMs` of now,
 *  - `signature` over `payload` was produced by one of `trustedSigners`
 *    (an EOA personal signature; contract-wallet signers are not supported).
 *
 * Which of world / sceneId / parcel is load-bearing depends on the consumer:
 * storage keys its rows by placeId = f(world, parcel); badges keys definitions
 * by world. All three are always checked.
 */
export async function verifyDelegation(
  scopeHeader: string | string[] | undefined,
  target: DelegationTarget
): Promise<DelegationResult> {
  const { audience, signer, world, sceneId, parcel, trustedSigners, maxTtlMs = DEFAULT_MAX_TTL_MS } = target

  if (trustedSigners.length === 0) {
    return { ok: false, reason: 'no trusted authoritative signers configured' }
  }
  if (!(Number.isFinite(maxTtlMs) && maxTtlMs > 0)) {
    return { ok: false, reason: 'invalid maxTtlMs' }
  }
  if (scopeHeader === undefined) {
    return { ok: false, reason: 'missing scope header' }
  }
  // A repeated header arrives as an array; picking one would be arbitrary.
  if (typeof scopeHeader !== 'string') {
    return { ok: false, reason: 'multiple scope headers' }
  }
  if (scopeHeader.length > MAX_SCOPE_HEADER_LENGTH) {
    return { ok: false, reason: 'scope header too large' }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(scopeHeader, 'base64').toString('utf8'))
  } catch {
    return { ok: false, reason: 'malformed scope header' }
  }

  // JSON.parse('null') is null and primitives are valid JSON: guard the shape
  // before destructuring so a bad header is a rejection, not a throw. Arrays
  // pass this guard and are rejected by the payload/signature check below.
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'malformed scope header' }
  }

  const { payload, signature } = parsed as { payload?: unknown; signature?: unknown }
  if (typeof payload !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'scope missing payload or signature' }
  }

  const claim = parseClaim(payload)
  if (!claim) return { ok: false, reason: 'unparseable claim' }

  if (claim.audience !== audience) {
    return { ok: false, reason: 'claim audience does not match this service' }
  }
  if (claim.ephemeral !== signer.toLowerCase()) {
    return { ok: false, reason: 'claim ephemeral does not match request signer' }
  }
  if (claim.world !== world.toLowerCase()) {
    return { ok: false, reason: 'claim world does not match target world' }
  }
  if (claim.sceneId !== sceneId) {
    return { ok: false, reason: 'claim sceneId does not match target scene' }
  }
  if (claim.parcel !== parcel) {
    return { ok: false, reason: 'claim parcel does not match target parcel' }
  }
  const now = Date.now()
  if (!(claim.expiration > now)) {
    return { ok: false, reason: 'delegation expired' }
  }
  if (claim.expiration - now > maxTtlMs) {
    return { ok: false, reason: 'delegation lifetime exceeds maxTtlMs' }
  }

  for (const root of trustedSigners) {
    if (await isPersonalSignatureBy(root, payload, signature)) return { ok: true }
  }

  return { ok: false, reason: 'claim not signed by a trusted authoritative address' }
}

/**
 * Whether `message` carries a valid EOA personal signature by `address`,
 * expressed as a minimal `[SIGNER, ECDSA_PERSONAL_SIGNED_ENTITY]` auth chain
 * and delegated to `Authenticator.validateSignature` rather than a hand-rolled
 * ecrecover. Contract-wallet (EIP-1654) signers are unsupported (`provider = null`).
 */
async function isPersonalSignatureBy(address: string, message: string, signature: string): Promise<boolean> {
  const chain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: address, signature: '' },
    { type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, payload: message, signature }
  ]
  try {
    const result = await Authenticator.validateSignature(message, chain, null)
    return result.ok
  } catch {
    return false
  }
}
