import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

const ADDRESS_RE = /^(0x)?[0-9a-fA-F]{40}$/
const HEX_RE = /^0x[0-9a-fA-F]+$/

/**
 * Returns true for a `0x`-prefixed string of one or more hex digits.
 * @public
 */
export function isHex(value: unknown): boolean {
  return typeof value === 'string' && HEX_RE.test(value)
}

/**
 * Decodes a hex string to bytes. The `0x` prefix is optional and an odd number
 * of digits is left-padded with a zero nibble.
 * @public
 */
export function hexToBytes(hex: string): Uint8Array {
  let digits = typeof hex === 'string' ? hex : String(hex)
  if (digits.startsWith('0x') || digits.startsWith('0X')) digits = digits.slice(2)
  if (digits.length % 2 !== 0) digits = '0' + digits
  const out = new Uint8Array(digits.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(digits.slice(i * 2, i * 2 + 2), 16)
    if (Number.isNaN(byte)) throw new Error(`Invalid hex string: ${hex}`)
    out[i] = byte
  }
  return out
}

export { bytesToHex }

/**
 * Applies the EIP-55 mixed-case checksum to an address. Accepts an optionally
 * `0x`-prefixed 40-digit hex string in any case and returns it `0x`-prefixed
 * and checksummed. The checksum of the input is not validated.
 *
 * @see https://eips.ethereum.org/EIPS/eip-55
 * @public
 */
export function getAddress(address: string): string {
  if (typeof address !== 'string' || !ADDRESS_RE.test(address)) {
    throw new Error(`invalid address (arg="address", value="${address}")`)
  }
  const lower = (address.startsWith('0x') ? address.slice(2) : address).toLowerCase()
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)))
  let out = '0x'
  for (let i = 0; i < lower.length; i++) {
    out += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i]
  }
  return out
}

/**
 * Coerces a JSON-RPC quantity (hex string, decimal string, or number) to a number.
 * @public
 */
export function toNumber(value: string | number | bigint): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  const text = String(value).trim()
  const parsed = text.startsWith('0x') || text.startsWith('0X') ? BigInt(text) : BigInt(text)
  return Number(parsed)
}

/** Encodes a number as a minimal JSON-RPC hex quantity. */
export function toQuantity(value: number | bigint): string {
  return '0x' + BigInt(value).toString(16)
}
