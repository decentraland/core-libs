// Domain-separated prefix for the authoritative scope delegation claim. Kept
// distinct from "Decentraland Login" so a delegation can never be replayed as a
// normal signed-fetch login (or vice versa). The minter (sdk-multiplayer-server)
// and every verifier (world-storage-service, badges) share this exact string.
export const DELEGATION_PREFIX = 'Decentraland Authoritative Storage Delegation'

// Every line after the prefix, each present exactly once. No field prefix is a
// prefix of another, so matching is unambiguous.
export const CLAIM_FIELDS = ['Ephemeral:', 'World:', 'SceneId:', 'Parcel:', 'Expiration:'] as const

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
 * Callers validate the inputs' charsets before this point: each value is
 * interpolated verbatim into a newline-delimited payload, so a stray newline
 * would inject a spoofed claim line.
 */
export function buildClaimPayload(input: ClaimInput): string {
  const expiration = input.expiration instanceof Date ? input.expiration : new Date(input.expiration)
  return [
    DELEGATION_PREFIX,
    `Ephemeral: ${input.ephemeral.toLowerCase()}`,
    `World: ${input.world.toLowerCase()}`,
    `SceneId: ${input.sceneId}`,
    `Parcel: ${input.parcel}`,
    `Expiration: ${expiration.toISOString()}`
  ].join('\n')
}

/**
 * Parse a claim payload strictly: the prefix line, then EXACTLY the known field
 * lines, each once, nothing else. Returns null on any structural deviation, so
 * minter/verifier format drift fails closed instead of silently binding an
 * unexpected value.
 */
export function parseClaim(payload: string): ParsedClaim | null {
  const lines = payload.split('\n')
  if (lines[0] !== DELEGATION_PREFIX) return null

  const values = new Map<string, string>()
  for (const line of lines.slice(1)) {
    const prefix = CLAIM_FIELDS.find((p) => line.startsWith(p))
    if (!prefix || values.has(prefix)) return null
    values.set(prefix, line.slice(prefix.length).trim())
  }
  if (values.size !== CLAIM_FIELDS.length) return null

  const ephemeral = values.get('Ephemeral:')?.toLowerCase()
  const world = values.get('World:')?.toLowerCase()
  const sceneId = values.get('SceneId:')
  const parcel = values.get('Parcel:')
  const expirationIso = values.get('Expiration:')
  if (!ephemeral || !world || !sceneId || !parcel || !expirationIso) return null

  const expiration = Date.parse(expirationIso)
  if (!Number.isFinite(expiration)) return null

  return { ephemeral, world, sceneId, parcel, expiration }
}
