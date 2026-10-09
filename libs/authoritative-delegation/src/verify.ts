import type { AuthChain } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import { parseClaim } from './claim'

// Header carrying the delegation on a signed request (base64 JSON `{ payload, signature }`).
export const SCOPE_HEADER = 'x-authoritative-scope'

// Upper bound on the scope header before base64-decoding and JSON.parse. A
// legitimate claim is a few hundred bytes; this caps work on attacker input.
export const MAX_SCOPE_HEADER_LENGTH = 4096

// `reason` is populated only on rejection.
export interface DelegationResult {
  ok: boolean
  reason?: string
}

/** The scene the request targets, matched against the root-signed claim. */
export interface DelegationTarget {
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
}

/**
 * Verify an authoritative scope delegation carried in `x-authoritative-scope`.
 *
 * A request is authorized when ALL hold:
 *  - the claim is well-formed and unexpired,
 *  - its ephemeral == the request's actual signer (a captured claim can't be
 *    replayed with a different signing key),
 *  - its world, sceneId and parcel == the target's,
 *  - `signature` over `payload` was produced by one of `trustedSigners`
 *    (an EOA personal signature; contract-wallet signers are not supported).
 *
 * Which of world / sceneId / parcel is load-bearing depends on the consumer:
 * storage keys its rows by placeId = f(world, parcel); badges keys definitions
 * by world. All three are always checked.
 */
export async function verifyDelegation(scopeHeader: string, target: DelegationTarget): Promise<DelegationResult> {
  const { signer, world, sceneId, parcel, trustedSigners } = target

  if (trustedSigners.length === 0) {
    return { ok: false, reason: 'no trusted authoritative signers configured' }
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

  // JSON.parse('null') is null and primitives/arrays are valid JSON: guard the
  // shape before destructuring so a bad header is a rejection, not a throw.
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, reason: 'malformed scope header' }
  }

  const { payload, signature } = parsed as { payload?: unknown; signature?: unknown }
  if (typeof payload !== 'string' || typeof signature !== 'string') {
    return { ok: false, reason: 'scope missing payload or signature' }
  }

  const claim = parseClaim(payload)
  if (!claim) return { ok: false, reason: 'unparseable claim' }

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
  if (!(claim.expiration > Date.now())) {
    return { ok: false, reason: 'delegation expired' }
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
