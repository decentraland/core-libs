import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { toHex } from 'ethereum-cryptography/utils.js'

/**
 * Calculates the metadata hash. Uses the keys to determine which fields of the metadata object will be used for the result.
 *
 * @remarks
 * This function hashes the raw bytes of `JSON.stringify(pick(metadata, keys))`, so the resulting
 * hash is **sensitive to ordering**, not just to the semantic content of the metadata:
 *
 * - The order of `keys` determines the order the picked fields are serialized, so passing the same
 *   keys in a different order produces a different hash.
 * - The insertion order of properties within `metadata` (and within any nested objects) is preserved
 *   by `JSON.stringify`, so two objects that are deeply equal but were built with a different key
 *   insertion order will hash differently.
 *
 * As a result, semantically-identical metadata can produce different hashes. This is intentional,
 * legacy-compatible behavior: callers must pass a stable, canonical `keys` order and canonically-ordered
 * metadata to obtain a reproducible hash. Do not "fix" this by sorting keys — doing so would change the
 * hashes of already-published entities.
 *
 * @public
 */
export function keccak256Hash(metadata: Record<string, unknown>, keys: string[]): string {
  const partialMetadata = JSON.stringify(pick(metadata, keys))
  const data = new TextEncoder().encode(partialMetadata)
  const hash = keccak256(data)
  return toHex(hash)
}

const pick = (obj: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => Object.hasOwn(obj, key)).map((key) => [key, obj[key]]))
