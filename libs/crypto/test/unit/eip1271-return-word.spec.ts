import { Authenticator } from '../../src/Authenticator'
import { AuthLinkType } from '../../src/types'
import type { AuthChain, ValidationResult } from '../../src/types'

interface JsonRpcRequest {
  id: number
  method: string
}

const PAYLOAD = 'QmUsqJaHc5HQaBrojhBdjF4fr5MQc6CqhwZjqwhVRftNAo'

describe('when a contract wallet answers isValidSignature', () => {
  let callResult: string
  let sendAsync: jest.Mock
  let chain: AuthChain
  let result: ValidationResult

  beforeEach(() => {
    sendAsync = jest.fn((request: JsonRpcRequest, callback: (error: Error | null, response?: unknown) => void) => {
      if (request.method === 'eth_call') {
        callback(null, { jsonrpc: '2.0', id: request.id, result: callResult })
      } else {
        callback(new Error('unavailable'))
      }
    })
    chain = [
      { type: AuthLinkType.SIGNER, payload: '0x3b21028719a4aca7ebee35b0157a6f1b0cf0d0c5', signature: '' },
      { type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, payload: PAYLOAD, signature: '0x' + 'ab'.repeat(100) }
    ]
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the return word is the magic value followed by zero padding', () => {
    beforeEach(async () => {
      callResult = '0x1626ba7e' + '0'.repeat(56)
      result = await Authenticator.validateSignature(PAYLOAD, chain, { sendAsync })
    })

    it('should accept the signature', () => {
      expect(result).toEqual({ ok: true, message: undefined })
    })
  })

  describe('and the return word is the magic value followed by non-zero bytes', () => {
    beforeEach(async () => {
      callResult = '0x1626ba7e' + 'f'.repeat(56)
      result = await Authenticator.validateSignature(PAYLOAD, chain, { sendAsync })
    })

    it('should refuse the signature', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and the return data is only the 4-byte magic value', () => {
    beforeEach(async () => {
      callResult = '0x1626ba7e'
      result = await Authenticator.validateSignature(PAYLOAD, chain, { sendAsync })
    })

    it('should refuse the signature', () => {
      expect(result.ok).toBe(false)
    })
  })
})
