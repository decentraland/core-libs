import { hexToBytes } from 'eth-connect'
import { createIdentity } from 'eth-crypto'
import { keccak256 } from 'ethereum-cryptography/keccak'
import { bytesToHex, utf8ToBytes } from 'ethereum-cryptography/utils'
import { Authenticator } from '../../src/Authenticator'
import { ethSign, recoverAddressFromEthSignature, recoverPublicKey, sign } from '../../src/crypto'
import type { AuthChain, AuthIdentity, IdentityType } from '../../src/types'

describe('README examples', () => {
  describe('when signing a hash with eth-crypto and recovering the public key', () => {
    let identity: IdentityType
    let hash: Uint8Array
    let signature: string
    let recoveredPub: Uint8Array

    beforeEach(() => {
      identity = createIdentity()
      hash = keccak256(utf8ToBytes('test'))
      signature = sign(hexToBytes(identity.privateKey), hash)
      recoveredPub = recoverPublicKey(hexToBytes(signature), hash)
    })

    it('should recover the public key of the signing identity', () => {
      expect(bytesToHex(recoveredPub)).toEqual(identity.publicKey)
    })
  })

  describe('when signing a message with eth-crypto and recovering the address', () => {
    let identity: IdentityType
    let signature: string
    let recoveredAddress: string

    beforeEach(() => {
      identity = createIdentity()
      signature = ethSign(hexToBytes(identity.privateKey), 'test')
      recoveredAddress = recoverAddressFromEthSignature(signature, 'test')
    })

    it('should recover the address of the signing identity', () => {
      expect(recoveredAddress).toEqual(identity.address)
    })
  })

  describe('when creating an auth chain with a mock signature', () => {
    let ephemeralIdentity: IdentityType
    let realAccount: IdentityType
    let message: string
    let authChain: AuthChain

    beforeEach(() => {
      ephemeralIdentity = createIdentity()
      realAccount = createIdentity()
      message = 'test'
      authChain = Authenticator.createAuthChain(realAccount, ephemeralIdentity, 10, message)
    })

    it('should produce an auth chain with three links', () => {
      expect(authChain.length).toEqual(3)
    })

    it('should set the first link as SIGNER with the real account address as payload', () => {
      expect(authChain[0].type).toEqual('SIGNER')
      expect(authChain[0].payload).toEqual(realAccount.address)
    })

    it('should set the second link as ECDSA_EPHEMERAL signed by the real account', () => {
      expect(authChain[1].type).toEqual('ECDSA_EPHEMERAL')
      const recovered = recoverAddressFromEthSignature(authChain[1].signature ?? '', authChain[1].payload)

      expect(recovered).toEqual(realAccount.address)
    })
  })

  describe('when initializing an auth chain with a mock signer', () => {
    let ephemeralIdentity: IdentityType
    let realAccount: IdentityType
    let identity: AuthIdentity

    beforeEach(async () => {
      ephemeralIdentity = createIdentity()
      realAccount = createIdentity()
      identity = await Authenticator.initializeAuthChain(realAccount.address, ephemeralIdentity, 10, async (message) =>
        Authenticator.createSignature(realAccount, message)
      )
    })

    it('should produce an auth chain with two links', () => {
      expect(identity.authChain.length).toEqual(2)
    })

    it('should set the first link as SIGNER with the real account address as payload', () => {
      expect(identity.authChain[0].type).toEqual('SIGNER')
      expect(identity.authChain[0].payload).toEqual(realAccount.address)
    })

    it('should set the second link as ECDSA_EPHEMERAL signed by the real account', () => {
      expect(identity.authChain[1].type).toEqual('ECDSA_EPHEMERAL')
      const recovered = recoverAddressFromEthSignature(
        identity.authChain[1].signature ?? '',
        identity.authChain[1].payload
      )

      expect(recovered).toEqual(realAccount.address)
    })
  })
})
