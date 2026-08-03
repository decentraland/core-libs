import * as EthCrypto from 'eth-crypto'
import { Authenticator, createEIP1271MessageHash } from '../../src/Authenticator'
import { createUnsafeIdentity, ethSign, recoverAddressFromEthSignature } from '../../src/crypto'
import { bytesToHex, hexToBytes } from '../../src/eth/hex'

describe('createEIP1271MessageHash', () => {
  // Known-answer vectors: these are the published keccak256 digests of the given
  // strings, not values produced by this implementation, so they pin the hash
  // rather than merely asserting it agrees with itself.
  const vectors: ReadonlyArray<[string, string]> = [
    ['', 'c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'],
    ['hello', '1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8']
  ]

  it.each(vectors)('should hash %p to the published keccak256 digest', (message, expected) => {
    expect(bytesToHex(createEIP1271MessageHash(message))).toEqual(expected)
  })

  it('should produce a 32-byte digest', () => {
    expect(createEIP1271MessageHash('anything').length).toEqual(32)
  })

  it('should NOT apply the personal-sign prefix', () => {
    // EIP-1271 wallets verify the raw keccak256 of the message bytes; if the
    // "\x19Ethereum Signed Message:\n" prefix leaked in, this would match.
    expect(bytesToHex(createEIP1271MessageHash('hello'))).not.toEqual(
      bytesToHex(Authenticator.createEthereumMessageHash('hello'))
    )
  })

  it('should be reachable from the Authenticator object', () => {
    expect(bytesToHex(Authenticator.createEIP1271MessageHash('hello'))).toEqual(vectors[1][1])
  })
})

describe('signing non-ASCII messages', () => {
  // createEthereumMessageHash derives its length prefix from the UTF-8 encoded byte
  // length, so an encoder disagreement changes the signed digest. Cross-check against
  // eth-crypto rather than against ourselves.
  const messages = ['ñáé 漢字 🚀', 'Ω≈ç√∫˜µ', 'á combining', 'ÿ', 'emoji 👨‍👩‍👧‍👦 family']

  it.each(messages)('should round-trip %p through sign and recover', (message) => {
    const identity = createUnsafeIdentity()
    const signature = ethSign(hexToBytes(identity.privateKey), message)
    expect(recoverAddressFromEthSignature(signature, message).toLowerCase()).toEqual(identity.address.toLowerCase())
  })

  it.each(messages)('should agree with eth-crypto on the recovered address for %p', (message) => {
    const identity = EthCrypto.createIdentity()
    const signature = EthCrypto.sign(identity.privateKey, EthCrypto.hash.keccak256(message))
    const recovered = EthCrypto.recoverPublicKey(signature, EthCrypto.hash.keccak256(message))
    expect(EthCrypto.publicKey.toAddress(recovered).toLowerCase()).toEqual(identity.address.toLowerCase())

    const ours = ethSign(hexToBytes(identity.privateKey.replace(/^0x/, '')), message)
    expect(recoverAddressFromEthSignature(ours, message).toLowerCase()).toEqual(identity.address.toLowerCase())
  })
})
