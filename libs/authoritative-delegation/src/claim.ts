// Domain-separated prefix for the authoritative scope delegation claim. Kept
// distinct from "Decentraland Login" so a delegation can never be replayed as a
// normal signed-fetch login (or vice versa), and from the v1 "Decentraland
// Authoritative Storage Delegation" claim that world-storage-service verifies
// on its own, so neither format can ever parse as the other.
export const DELEGATION_PREFIX = 'Decentraland Authoritative Delegation'

// Every line after the prefix, each present exactly once. No field prefix is a
// prefix of another, so matching is unambiguous.
export const CLAIM_FIELDS = ['Audience:', 'Ephemeral:', 'World:', 'SceneId:', 'Parcel:', 'Expiration:'] as const

// Value formats, enforced by both buildClaimPayload and parseClaim. Ephemeral,
// world, sceneId and parcel mirror sdk-multiplayer-server's storage-gatekeeper.
// None admits whitespace, so no value can inject a claim line.
// Service id the claim is for (`badges`, `storage`), not a hostname, so every
// environment of a service shares it. Environments are told apart by their
// trusted signers.
export const AUDIENCE_FORMAT = /^[a-z0-9-]+$/
// Lowercased EOA address.
export const EPHEMERAL_FORMAT = /^0x[0-9a-f]{40}$/
// Lowercased ENS-style world name; ASCII only, so no NFC/NFD drift between
// minter and verifier.
export const WORLD_FORMAT = /^[a-z0-9][a-z0-9._-]*$/
// Scene entity hash (CID).
export const SCENE_ID_FORMAT = /^[A-Za-z0-9-]+$/
// Base parcel, integer `"x,y"`. Digit bound matches world-storage-service's PARCEL_PATTERN.
export const PARCEL_FORMAT = /^-?\d{1,10},-?\d{1,10}$/

// The builder lowercases ephemeral and world for its callers, so it checks the
// raw input case-insensitively first. Without the `u` flag `/i` folds ASCII
// only: `'K'` (Kelvin sign) does not match `k`, although it lowercases to it.
const EPHEMERAL_INPUT_FORMAT = new RegExp(EPHEMERAL_FORMAT.source, 'i')
const WORLD_INPUT_FORMAT = new RegExp(WORLD_FORMAT.source, 'i')

export interface ParsedClaim {
  /** Service id the claim is for. */
  audience: string
  /** Lowercased ephemeral address the claim authorizes. */
  ephemeral: string
  /** Lowercased world name. */
  world: string
  /** Scene entity hash. */
  sceneId: string
  /** Base parcel, `"x,y"`. */
  parcel: string
  /** Unix millis. */
  expiration: number
}

export interface ClaimInput {
  /** Service id the claim is for, matching `AUDIENCE_FORMAT`. */
  audience: string
  /** Ephemeral address, any casing; lowercased into the claim. */
  ephemeral: string
  /** World name, any ASCII casing; lowercased into the claim. */
  world: string
  sceneId: string
  parcel: string
  /** Absolute expiry; written as ISO-8601. */
  expiration: Date | number
}

/**
 * Build the canonical claim payload the root key signs:
 *
 *   Decentraland Authoritative Delegation
 *   Audience: <service>
 *   Ephemeral: 0x<addr>
 *   World: <name>
 *   SceneId: <hash>
 *   Parcel: <x,y>
 *   Expiration: <ISO8601>
 *
 * Each value is interpolated verbatim into a newline-delimited payload, so every
 * one is checked against its format first (no whitespace, so no injected claim
 * line).
 *
 * @throws Error if a value doesn't match its format or `expiration` is not a
 *   valid date.
 */
export function buildClaimPayload(input: ClaimInput): string {
  const { audience, sceneId, parcel } = input
  const expiration = input.expiration instanceof Date ? input.expiration : new Date(input.expiration)

  if (!AUDIENCE_FORMAT.test(audience)) throw new Error('Invalid delegation claim audience')
  if (!EPHEMERAL_INPUT_FORMAT.test(input.ephemeral)) throw new Error('Invalid delegation claim ephemeral address')
  if (!WORLD_INPUT_FORMAT.test(input.world)) throw new Error('Invalid delegation claim world name')
  if (!SCENE_ID_FORMAT.test(sceneId)) throw new Error('Invalid delegation claim sceneId')
  if (!PARCEL_FORMAT.test(parcel)) throw new Error('Invalid delegation claim parcel')
  if (!Number.isFinite(expiration.getTime())) throw new Error('Invalid delegation claim expiration')

  return [
    DELEGATION_PREFIX,
    `Audience: ${audience}`,
    `Ephemeral: ${input.ephemeral.toLowerCase()}`,
    `World: ${input.world.toLowerCase()}`,
    `SceneId: ${sceneId}`,
    `Parcel: ${parcel}`,
    `Expiration: ${expiration.toISOString()}`
  ].join('\n')
}

/**
 * Parse a claim payload strictly: the prefix line, then EXACTLY the known field
 * lines, each once, nothing else. Each line is `<Field>: <value>` with a single
 * space, and each value must match its exported format as written (no case
 * folding), so the value compared is byte-for-byte the value signed.
 * `Expiration` must be the exact `Date#toISOString()` form. Returns null on any
 * deviation, so minter/verifier format drift fails closed instead of silently
 * binding an unexpected value.
 */
export function parseClaim(payload: string): ParsedClaim | null {
  const lines = payload.split('\n')
  if (lines[0] !== DELEGATION_PREFIX) return null

  const values = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const prefix = CLAIM_FIELDS.find((p) => line.startsWith(`${p} `))
    if (!prefix || values.has(prefix)) return null
    values.set(prefix, line.slice(prefix.length + 1))
  }
  if (values.size !== CLAIM_FIELDS.length) return null

  // Every field is present (size check above); '' only satisfies the type, and
  // matches no format.
  const field = (name: (typeof CLAIM_FIELDS)[number]) => values.get(name) ?? ''
  const audience = field('Audience:')
  const ephemeral = field('Ephemeral:')
  const world = field('World:')
  const sceneId = field('SceneId:')
  const parcel = field('Parcel:')
  const expirationIso = field('Expiration:')
  if (
    !AUDIENCE_FORMAT.test(audience) ||
    !EPHEMERAL_FORMAT.test(ephemeral) ||
    !WORLD_FORMAT.test(world) ||
    !SCENE_ID_FORMAT.test(sceneId) ||
    !PARCEL_FORMAT.test(parcel)
  ) {
    return null
  }

  // Date.parse alone accepts non-ISO forms ("2030", local-time strings); only
  // the canonical form the builder writes round-trips.
  const expiration = Date.parse(expirationIso)
  if (!Number.isFinite(expiration) || new Date(expiration).toISOString() !== expirationIso) return null

  return { audience, ephemeral, world, sceneId, parcel, expiration }
}
