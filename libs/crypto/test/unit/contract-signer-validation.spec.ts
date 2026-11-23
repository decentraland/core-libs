import { Authenticator } from '../../src/Authenticator'
import { SignatureValidator } from '../../src/contracts/SignatureValidator'
import { AuthLinkType } from '../../src/types'
import type { AuthChain, ValidationResult } from '../../src/types'

jest.mock('../../src/contracts/SignatureValidator', () => ({
  SignatureValidator: jest.fn()
}))

const PAYLOAD = 'QmUsqJaHc5HQaBrojhBdjF4fr5MQc6CqhwZjqwhVRftNAo'
const CONTRACT_SIGNATURE = '0x' + 'ab'.repeat(100)
const MAGIC_WORD = new Uint8Array([0x16, 0x26, 0xba, 0x7e, ...new Array(28).fill(0)])

function contractChain(signer: string): AuthChain {
  return [
    { type: AuthLinkType.SIGNER, payload: signer, signature: '' },
    { type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, payload: PAYLOAD, signature: CONTRACT_SIGNATURE }
  ]
}

describe('when checking whether an address is reserved', () => {
  describe.each([
    ['the zero address', '0x0000000000000000000000000000000000000000'],
    ['the first precompile', '0x0000000000000000000000000000000000000001'],
    ['the last address of the range', '0x00000000000000000000000000000000000000ff'],
    ['an uppercase hex address in the range', '0x00000000000000000000000000000000000000FF'],
    ['an address in the range with an uppercase prefix', '0X0000000000000000000000000000000000000009'],
    ['an address in the range without a prefix', '0000000000000000000000000000000000000002']
  ])('and the address is %s', (_, value) => {
    let address: string

    beforeEach(() => {
      address = value
    })

    it('should report it as reserved', () => {
      expect(Authenticator.isReservedAddress(address)).toBe(true)
    })
  })

  describe.each([
    ['the first address after the range', '0x0000000000000000000000000000000000000100'],
    ['a regular address', '0x3b21028719a4aca7ebee35b0157a6f1b0cf0d0c5'],
    ['a shorter value', '0x01']
  ])('and the address is %s', (_, value) => {
    let address: string

    beforeEach(() => {
      address = value
    })

    it('should not report it as reserved', () => {
      expect(Authenticator.isReservedAddress(address)).toBe(false)
    })
  })
})

describe('when validating a contract-wallet chain', () => {
  let isValidSignatureMock: jest.Mock
  let sendAsyncMock: jest.Mock
  let provider: { sendAsync: jest.Mock }
  let chain: AuthChain
  let result: ValidationResult

  beforeEach(() => {
    isValidSignatureMock = jest.fn()
    sendAsyncMock = jest.fn((_payload, callback) => callback(new Error('unavailable')))
    provider = { sendAsync: sendAsyncMock }
    ;(SignatureValidator as jest.Mock).mockResolvedValue({ isValidSignature: isValidSignatureMock })
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the signer is in the reserved address range', () => {
    beforeEach(async () => {
      isValidSignatureMock.mockResolvedValue(MAGIC_WORD)
      chain = contractChain('0x0000000000000000000000000000000000000001')
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider)
    })

    it('should refuse it as not a contract wallet', () => {
      expect(result).toEqual({
        ok: false,
        message: expect.stringContaining('is not a contract wallet')
      })
    })

    it('should not query the signer contract', () => {
      expect(SignatureValidator).not.toHaveBeenCalled()
    })
  })

  describe('and the delegated ephemeral address is in the reserved address range', () => {
    beforeEach(async () => {
      isValidSignatureMock.mockResolvedValue(MAGIC_WORD)
      chain = [
        { type: AuthLinkType.SIGNER, payload: '0x3b21028719a4aca7ebee35b0157a6f1b0cf0d0c5', signature: '' },
        {
          type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL,
          payload: Authenticator.getEphemeralMessage(
            '0x00000000000000000000000000000000000000ff',
            new Date(Date.now() + 60 * 60 * 1000)
          ),
          signature: CONTRACT_SIGNATURE
        },
        { type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, payload: PAYLOAD, signature: CONTRACT_SIGNATURE }
      ]
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider)
    })

    it('should refuse it as not a contract wallet', () => {
      expect(result.message).toContain('is not a contract wallet')
    })

    it('should query only the signer contract', () => {
      expect(SignatureValidator).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the contract returns the magic value as a full ABI word', () => {
    beforeEach(async () => {
      isValidSignatureMock.mockResolvedValue(MAGIC_WORD)
      chain = contractChain('0x3b21028719a4aca7ebee35b0157a6f1b0cf0d0c5')
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider)
    })

    it('should accept it', () => {
      expect(result).toEqual({ ok: true, message: undefined })
    })
  })

  describe.each([
    ['only the 4-byte magic value', new Uint8Array([0x16, 0x26, 0xba, 0x7e])],
    [
      'the magic value followed by non-zero bytes',
      new Uint8Array([0x16, 0x26, 0xba, 0x7e, ...new Array(28).fill(0xff)])
    ],
    [
      'the magic value followed by a single non-zero last byte',
      new Uint8Array([0x16, 0x26, 0xba, 0x7e, ...new Array(27).fill(0), 1])
    ]
  ])('and the contract returns %s', (_, word) => {
    beforeEach(async () => {
      isValidSignatureMock.mockResolvedValue(word)
      chain = contractChain('0x3b21028719a4aca7ebee35b0157a6f1b0cf0d0c5')
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider)
    })

    it('should refuse it', () => {
      expect(result.ok).toBe(false)
    })
  })
})
