// Domain-separated prefix for the authoritative scope delegation claim. Kept
// distinct from "Decentraland Login" so a delegation can never be replayed as a
// normal signed-fetch login (or vice versa). The minter (sdk-multiplayer-server)
// and every verifier (world-storage-service, badges) share this exact string.
export const DELEGATION_PREFIX = 'Decentraland Authoritative Storage Delegation'

// Every line after the prefix, each present exactly once. No field prefix is a
// prefix of another, so matching is unambiguous.
export const CLAIM_FIELDS = ['Ephemeral:', 'World:', 'SceneId:', 'Parcel:', 'Expiration:'] as const

// Value formats enforced by buildClaimPayload, mirroring sdk-multiplayer-server's
// storage-gatekeeper. None admits whitespace, so no value can inject a claim line.
// Lowercased EOA address.
export const EPHEMERAL_FORMAT = /^0x[0-9a-f]{40}$/
// Lowercased ENS-style world name; ASCII only, so no NFC/NFD drift between
// minter and verifier.
export const WORLD_FORMAT = /^[a-z0-9][a-z0-9._-]*$/
// Scene entity hash (CID).
export const SCENE_ID_FORMAT = /^[A-Za-z0-9-]+$/
// Base parcel, integer `"x,y"`. Digit bound matches world-storage-service's PARCEL_PATTERN.
export const PARCEL_FORMAT = /^-?\d{1,10},-?\d{1,10}$/

export interface ParsedClaim {
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
  /** Ephemeral address; lowercased into the claim. */
  ephemeral: string
  /** World name; lowercased into the claim. */
  world: string
  sceneId: string
  parcel: string
  /** Absolute expiry; written as ISO-8601. */
  expiration: Date | number
}

/**
 * Build the canonical claim payload the root key signs:
 *
 *   Decentraland Authoritative Storage Delegation
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
  const ephemeral = input.ephemeral.toLowerCase()
  const world = input.world.toLowerCase()
  const { sceneId, parcel } = input
  const expiration = input.expiration instanceof Date ? input.expiration : new Date(input.expiration)

  if (!EPHEMERAL_FORMAT.test(ephemeral)) throw new Error('Invalid delegation claim ephemeral address')
  if (!WORLD_FORMAT.test(world)) throw new Error('Invalid delegation claim world name')
  if (!SCENE_ID_FORMAT.test(sceneId)) throw new Error('Invalid delegation claim sceneId')
  if (!PARCEL_FORMAT.test(parcel)) throw new Error('Invalid delegation claim parcel')
  if (!Number.isFinite(expiration.getTime())) throw new Error('Invalid delegation claim expiration')

  return [
    DELEGATION_PREFIX,
    `Ephemeral: ${ephemeral}`,
    `World: ${world}`,
    `SceneId: ${sceneId}`,
    `Parcel: ${parcel}`,
    `Expiration: ${expiration.toISOString()}`
  ].join('\n')
}

/**
 * Parse a claim payload strictly: the prefix line, then EXACTLY the known field
 * lines, each once, nothing else. Each line is `<Field>: <value>` with a single
 * space and a value free of whitespace, so the value compared is byte-for-byte
 * the value signed. `Expiration` must be the exact `Date#toISOString()` form.
 * Returns null on any deviation, so minter/verifier format drift fails closed
 * instead of silently binding an unexpected value.
 */
export function parseClaim(payload: string): ParsedClaim | null {
  const lines = payload.split('\n')
  if (lines[0] !== DELEGATION_PREFIX) return null

  const values = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const prefix = CLAIM_FIELDS.find((p) => line.startsWith(`${p} `))
    if (!prefix || values.has(prefix)) return null
    const value = line.slice(prefix.length + 1)
    if (/\s/.test(value)) return null
    values.set(prefix, value)
  }
  if (values.size !== CLAIM_FIELDS.length) return null

  const ephemeral = values.get('Ephemeral:')?.toLowerCase()
  const world = values.get('World:')?.toLowerCase()
  const sceneId = values.get('SceneId:')
  const parcel = values.get('Parcel:')
  const expirationIso = values.get('Expiration:')
  if (!ephemeral || !world || !sceneId || !parcel || !expirationIso) return null

  // Date.parse alone accepts non-ISO forms ("2030", local-time strings); only
  // the canonical form the builder writes round-trips.
  const expiration = Date.parse(expirationIso)
  if (!Number.isFinite(expiration) || new Date(expiration).toISOString() !== expirationIso) return null

  return { ephemeral, world, sceneId, parcel, expiration }
}
