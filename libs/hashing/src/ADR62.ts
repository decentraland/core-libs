import { keccak256 } from 'ethereum-cryptography/keccak.js'
import { toHex } from 'ethereum-cryptography/utils.js'

/**
 * Calculates the metadata hash. Uses the keys to determine which fields of the metadata object will be used for the result.
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
