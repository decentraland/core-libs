import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'
import { hexToBytes } from '../eth/hex'
import type { BlockIdentifier, EthClient } from '../eth/rpc'

const WORD = 32
const SIGNATURE = 'isValidSignature(bytes32,bytes)'
const SELECTOR = bytesToHex(keccak_256(utf8ToBytes(SIGNATURE))).slice(0, 8)

function padRight(bytes: Uint8Array): string {
  const remainder = bytes.length % WORD
  const padding = remainder === 0 ? 0 : WORD - remainder
  return bytesToHex(bytes) + '00'.repeat(padding)
}

function word(value: number): string {
  return value.toString(16).padStart(WORD * 2, '0')
}

/**
 * ABI-encodes a call to `isValidSignature(bytes32,bytes)`.
 *
 * Layout: the 4-byte selector, then the head — the `bytes32` hash followed by
 * the offset to the dynamic argument (two words, so `0x40`) — then the tail,
 * being the signature's length and its right-padded contents.
 *
 * @see https://docs.soliditylang.org/en/latest/abi-spec.html
 */
export function encodeIsValidSignature(hash: Uint8Array, signature: Uint8Array): string {
  if (hash.length !== WORD) {
    throw new Error(`isValidSignature expects a 32-byte hash, got ${hash.length}`)
  }
  return '0x' + SELECTOR + bytesToHex(hash) + word(WORD * 2) + word(signature.length) + padRight(signature)
}

/** Decodes the left-aligned `bytes4` magic value from a 32-byte return word. */
export function decodeMagicValue(result: string): Uint8Array {
  const bytes = hexToBytes(result)
  if (bytes.length < 4) {
    throw new Error(`isValidSignature returned ${bytes.length} bytes, expected at least 4`)
  }
  return bytes.slice(0, 4)
}

export interface SignatureValidator {
  isValidSignature(hash: Uint8Array, signature: Uint8Array, block?: BlockIdentifier): Promise<Uint8Array>
}

/**
 * Binds an EIP-1271/ERC-1654 signature-validating contract at `address`.
 * @public
 */
export async function SignatureValidator(client: EthClient, address: string): Promise<SignatureValidator> {
  return {
    async isValidSignature(hash: Uint8Array, signature: Uint8Array, block: BlockIdentifier = 'latest') {
      const data = encodeIsValidSignature(hash, signature)
      return decodeMagicValue(await client.eth_call(address, data, block))
    }
  }
}
