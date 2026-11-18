import { bytesToHex, hexToBytes } from 'eth-connect'
import { secp256k1 } from 'ethereum-cryptography/secp256k1'
import { Authenticator } from '../../src/Authenticator'
import { createUnsafeIdentity, ethSign, recoverAddressFromEthSignature } from '../../src/crypto'
import type { AuthIdentity, IdentityType, ValidationResult } from '../../src/types'

const N = secp256k1.CURVE.n

/** The other valid signature of the same message: s replaced by n - s, with the recovery bit flipped. */
function toHighS(signature: string): string {
  const bytes = hexToBytes(signature)
  const s = BigInt('0x' + bytesToHex(bytes.slice(32, 64)).replace(/^0x/, ''))
  const highS = (N - s).toString(16).padStart(64, '0')
  const v = bytes[64] === 0x1b ? '1c' : '1b'
  return '0x' + bytesToHex(bytes.slice(0, 32)).replace(/^0x/, '') + highS + v
}

function withRS(signature: string, r: string, s: string): string {
  return '0x' + r + s + signature.slice(-2)
}

describe('when recovering the address of a personal signature', () => {
  let identity: IdentityType
  let message: string
  let signature: string

  beforeEach(() => {
    identity = createUnsafeIdentity()
    message = 'Decentraland message'
    signature = ethSign(hexToBytes(identity.privateKey), message)
  })

  describe('and the signature is in low-s form', () => {
    it('should recover the signing address', () => {
      expect(recoverAddressFromEthSignature(signature, message)).toEqual(identity.address)
    })
  })

  describe('and the signature uses a 0 or 1 recovery value', () => {
    let legacySignature: string

    beforeEach(() => {
      legacySignature = signature.slice(0, -2) + (signature.endsWith('1b') ? '00' : '01')
    })

    it('should recover the signing address', () => {
      expect(recoverAddressFromEthSignature(legacySignature, message)).toEqual(identity.address)
    })
  })

  describe('and the signature is the high-s form of a valid signature', () => {
    let highSSignature: string

    beforeEach(() => {
      highSSignature = toHighS(signature)
    })

    it('should refuse it', () => {
      expect(() => recoverAddressFromEthSignature(highSSignature, message)).toThrow(
        's must not exceed half the curve order'
      )
    })
  })

  describe('and r is zero', () => {
    let zeroRSignature: string

    beforeEach(() => {
      zeroRSignature = withRS(signature, '0'.repeat(64), '1'.padStart(64, '0'))
    })

    it('should refuse it', () => {
      expect(() => recoverAddressFromEthSignature(zeroRSignature, message)).toThrow()
    })
  })

  describe('and s is zero', () => {
    let zeroSSignature: string

    beforeEach(() => {
      zeroSSignature = withRS(signature, '1'.padStart(64, '0'), '0'.repeat(64))
    })

    it('should refuse it', () => {
      expect(() => recoverAddressFromEthSignature(zeroSSignature, message)).toThrow()
    })
  })

  describe('and s equals the curve order', () => {
    let orderSSignature: string

    beforeEach(() => {
      orderSSignature = withRS(signature, '1'.padStart(64, '0'), N.toString(16).padStart(64, '0'))
    })

    it('should refuse it', () => {
      expect(() => recoverAddressFromEthSignature(orderSSignature, message)).toThrow()
    })
  })
})

describe('when validating an auth chain whose ephemeral link carries a high-s signature', () => {
  let owner: IdentityType
  let ephemeral: IdentityType
  let identity: AuthIdentity
  let result: ValidationResult

  beforeEach(async () => {
    owner = createUnsafeIdentity()
    ephemeral = createUnsafeIdentity()
    identity = await Authenticator.initializeAuthChain(owner.address, ephemeral, 10, async (message) =>
      toHighS(Authenticator.createSignature(owner, message))
    )
    result = await Authenticator.validateSignature(ephemeral.address, identity.authChain, null)
  })

  it('should refuse the chain as carrying a non-canonical signature', () => {
    expect(result).toEqual({ ok: false, message: expect.stringContaining('s must not exceed half the curve order') })
  })
})

describe('when validating an auth chain whose signed entity carries a high-s signature', () => {
  let owner: IdentityType
  let ephemeral: IdentityType
  let identity: AuthIdentity
  let result: ValidationResult

  beforeEach(async () => {
    owner = createUnsafeIdentity()
    ephemeral = createUnsafeIdentity()
    identity = await Authenticator.initializeAuthChain(owner.address, ephemeral, 10, async (message) =>
      Authenticator.createSignature(owner, message)
    )
    const chain = Authenticator.signPayload(identity, 'payload')
    chain[2] = { ...chain[2], signature: toHighS(chain[2].signature as string) }
    result = await Authenticator.validateSignature('payload', chain, null)
  })

  it('should refuse the chain as carrying a non-canonical signature', () => {
    expect(result).toEqual({ ok: false, message: expect.stringContaining('s must not exceed half the curve order') })
  })
})
