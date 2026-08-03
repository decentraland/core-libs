import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * Calculates the metadata hash. Uses the keys to determine which fields of the metadata object will be used for the result.
 * @public
 */
export function keccak256Hash(metadata: Record<string, unknown>, keys: string[]): string {
  const partialMetadata = JSON.stringify(pick(metadata, keys))
  const data = new TextEncoder().encode(partialMetadata)
  return bytesToHex(keccak_256(data))
}

const pick = (obj: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(keys.filter((key) => Object.hasOwn(obj, key)).map((key) => [key, obj[key]]))
