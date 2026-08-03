import { secp256k1 } from '@noble/curves/secp256k1.js'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import { getAddress, hexToBytes, isHex } from './eth/hex'

/**
 * returns the publicKey for the privateKey with which the messageHash was signed
 * @param  {string} signature
 * @param  {string} hash
 */
export function recoverPublicKey(signature: Uint8Array, hash: Uint8Array): Uint8Array {
  if (signature.length !== 65) {
    throw new Error('Invalid signature length ' + signature.length)
  }

  const v = signature[64]
  if (v !== 0x1b && v !== 0x1c) {
    throw new Error(`Invalid signature recovery value: ${v}. Expected 27 or 28.`)
  }

  const sigOnly = signature.slice(0, signature.length - 1)
  const recoveryNumber = v === 0x1c ? 1 : 0
  const pubKey = secp256k1.Signature.fromBytes(sigOnly, 'compact')
    .addRecoveryBit(recoveryNumber)
    .recoverPublicKey(hash)
    .toBytes(false)
  return pubKey.slice(1)
}

function sanitizeSignature(signature: Uint8Array): Uint8Array {
  if (signature.length !== 65) throw new Error('Invalid ethereum signature')

  const version = signature[64]

  if (version === 0 || version === 1) {
    const newSignature = new Uint8Array(signature)
    newSignature[64] = version + 27
    return newSignature
  }

  return signature
}

export function recoverAddressFromEthSignature(signature: Uint8Array | string, msg: string | Uint8Array): string {
  if (typeof signature === 'string') {
    if (isHex(signature)) return recoverAddressFromEthSignature(hexToBytes(signature), msg)
    throw new Error('String signatures must be encoded in hex')
  }

  return computeAddress(recoverPublicKey(sanitizeSignature(signature), createEthereumMessageHash(msg)))
}

export function sign(privateKey: Uint8Array, hash: Uint8Array): string {
  const sigObj = secp256k1.Signature.fromBytes(
    secp256k1.sign(hash, privateKey, { prehash: false, format: 'recovered' }),
    'recovered'
  )
  const recoveryId = sigObj.recovery === 1 ? '1c' : '1b'
  return '0x' + sigObj.toHex('compact') + recoveryId
}

export function createEthereumMessageHash(msg: string | Uint8Array): Uint8Array {
  const message = typeof msg === 'string' ? utf8ToBytes(msg) : msg
  const bytes = concatBytes(utf8ToBytes(`\x19Ethereum Signed Message:\n`), utf8ToBytes(String(message.length)), message)
  return keccak_256(bytes)
}

export function ethSign(privateKey: Uint8Array, message: Uint8Array | string): string {
  return sign(privateKey, createEthereumMessageHash(message))
}

export function computeAddress(key: Uint8Array): string {
  let publicKey: Uint8Array
  if (key.length === 65 && key[0] === 0x04) {
    publicKey = key.slice(1)
  } else if (key.length === 64) {
    publicKey = key
  } else {
    throw new Error(
      `Invalid public key length: ${key.length}. Expected 64 bytes, or 65 bytes with a leading 0x04 uncompressed prefix.`
    )
  }
  return getAddress(bytesToHex(keccak_256(publicKey)).substring(24))
}

/**
 * This method should not be used. It may use non-secure random number generators.
 */
export function createUnsafeIdentity(): { privateKey: string; publicKey: string; address: string } {
  const privateKey = secp256k1.utils.randomSecretKey()
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1)
  const address = computeAddress(publicKey)

  return {
    privateKey: bytesToHex(privateKey),
    publicKey: bytesToHex(publicKey),
    address
  }
}
