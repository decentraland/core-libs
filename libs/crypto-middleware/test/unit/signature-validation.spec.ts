import { AuthLinkType } from '@dcl/crypto'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { SignatureValidationInfrastructureError, validateAuthChainSignature } from '../../src/signature-validation'
import { identity as fixtureIdentity } from '../fixtures/identity'
import type { AuthChainProvider, JsonRpcCallback, JsonRpcRequest } from '../../src/rpc-provider'

const contractAccountThat =
  (verdict: 'accepts' | 'rejects') => (payload: JsonRpcRequest, callback: JsonRpcCallback) => {
    if (payload.method !== 'eth_call') {
      callback(null, {
        id: payload.id,
        jsonrpc: '2.0',
        result: payload.method === 'eth_blockNumber' ? '0x2' : { timestamp: '0x1', number: '0x2' }
      })
      return
    }
    callback(null, {
      id: payload.id,
      jsonrpc: '2.0',
      result: verdict === 'accepts' ? '0x1626ba7e' + '0'.repeat(56) : '0x' + '0'.repeat(64)
    })
  }

describe('validateAuthChainSignature', () => {
  let identity: AuthIdentity
  let sendAsync: jest.Mock
  let l1Provider: AuthChainProvider

  beforeEach(async () => {
    identity = fixtureIdentity
    sendAsync = jest.fn((_payload, callback) => callback(new Error('No RPC in tests')))
    l1Provider = { sendAsync }
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('when every link was signed by a plain EOA', () => {
    it('should validate it offline, without calling the provider', async () => {
      await expect(
        validateAuthChainSignature(identity.authChain, identity.ephemeralIdentity.address, l1Provider)
      ).resolves.toBeUndefined()
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })

  describe('when the chain was signed by an account with code behind it', () => {
    let authChain: AuthChain

    beforeEach(() => {
      authChain = [identity.authChain[0], { ...identity.authChain[1], type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL }]
    })

    describe('and the account accepts the signature', () => {
      beforeEach(() => {
        sendAsync.mockImplementation(contractAccountThat('accepts'))
      })

      it('should validate it on chain and release its validation signal', async () => {
        await expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).resolves.toBeUndefined()
        expect(sendAsync).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'eth_call' }),
          expect.any(Function),
          expect.objectContaining({ aborted: true })
        )
      })
    })

    describe('and the account rejects the signature', () => {
      beforeEach(() => {
        sendAsync.mockImplementation(contractAccountThat('rejects'))
      })

      it('should reject the chain, since the account did not confirm it', async () => {
        await expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).rejects.toThrow(/Invalid validation/)
        expect(sendAsync).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'eth_call' }),
          expect.any(Function),
          expect.any(AbortSignal)
        )
      })
    })

    describe('and the provider never answers', () => {
      let outcome: Promise<void>

      beforeEach(() => {
        jest.useFakeTimers()
        sendAsync.mockImplementation(() => undefined)
        outcome = expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).rejects.toBeInstanceOf(SignatureValidationInfrastructureError)
      })

      it('should abort the RPC signal and reject the chain after the deadline', async () => {
        await jest.advanceTimersByTimeAsync(15_000)
        await outcome
        expect(jest.getTimerCount()).toBe(0)

        expect(sendAsync).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'eth_call' }),
          expect.any(Function),
          expect.objectContaining({ aborted: true })
        )
      })
    })

    describe('and a successful RPC response arrives after the deadline', () => {
      let outcome: Promise<void>

      beforeEach(() => {
        jest.useFakeTimers()
        authChain.push({ ...authChain[1] })
        sendAsync.mockImplementation((payload, callback) => {
          setTimeout(() => contractAccountThat('accepts')(payload, callback), 16_000)
        })
        outcome = expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).rejects.toThrow(new SignatureValidationInfrastructureError('Signature validation timed out'))
      })

      it('should prevent subsequent chain links from issuing RPC requests', async () => {
        await jest.advanceTimersByTimeAsync(15_000)
        await outcome
        await jest.advanceTimersByTimeAsync(10_000)

        expect(sendAsync).toHaveBeenCalledTimes(1)
      })
    })

    describe('and another validation starts before the first validation times out', () => {
      let firstOutcome: Promise<void>
      let secondOutcome: Promise<void>

      beforeEach(async () => {
        jest.useFakeTimers()
        sendAsync
          .mockImplementationOnce(() => undefined)
          .mockImplementationOnce((payload, callback) => {
            setTimeout(() => contractAccountThat('accepts')(payload, callback), 10_000)
          })
        firstOutcome = expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).rejects.toThrow(new SignatureValidationInfrastructureError('Signature validation timed out'))
        await jest.advanceTimersByTimeAsync(10_000)
        secondOutcome = expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).resolves.toBeUndefined()
      })

      it('should keep the second validation active after aborting the first validation', async () => {
        await jest.advanceTimersByTimeAsync(5_000)
        await firstOutcome
        expect(sendAsync.mock.calls[0][2].aborted).toBe(true)
        expect(sendAsync.mock.calls[1][2].aborted).toBe(false)

        await jest.advanceTimersByTimeAsync(5_000)
        await secondOutcome
      })
    })

    describe('and the chain has exactly the maximum number of links', () => {
      beforeEach(() => {
        authChain = [authChain[0], ...Array.from({ length: 9 }, () => ({ ...authChain[1] }))]
        sendAsync.mockImplementation(contractAccountThat('accepts'))
      })

      it('should validate every contract signature', async () => {
        await expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).resolves.toBeUndefined()
        expect(sendAsync).toHaveBeenCalledTimes(9)
      })
    })

    describe('and the chain exceeds the link limit', () => {
      beforeEach(() => {
        authChain = [authChain[0], ...Array.from({ length: 10 }, () => ({ ...authChain[1] }))]
      })

      it('should reject the chain without issuing any RPC requests', async () => {
        await expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).rejects.toThrow('Auth chain exceeds maximum length of 10')
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })

    describe.each([
      [3, 'private revert reason'],
      [-32000, 'execution reverted: private revert reason'],
      [-32000, 'VM Exception while processing transaction: revert private revert reason']
    ])('and eth_call reverts with code %s and message %s', (code, message) => {
      let validation: Promise<void>

      beforeEach(() => {
        sendAsync.mockImplementation((payload: JsonRpcRequest, callback: JsonRpcCallback) => {
          if (payload.method === 'eth_call') {
            callback(null, { id: payload.id, jsonrpc: '2.0', error: { code: Number(code), message: String(message) } })
          } else {
            contractAccountThat('rejects')(payload, callback)
          }
        })
        validation = validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
      })

      it('should preserve normal signature rejection after trying prefixed and historical checks', async () => {
        await expect(validation).rejects.toThrow(/Invalid validation/)
        await expect(validation).rejects.not.toBeInstanceOf(SignatureValidationInfrastructureError)
        await expect(validation).rejects.not.toThrow('private revert reason')
        expect(sendAsync.mock.calls.filter(([payload]) => payload.method === 'eth_call')).toHaveLength(4)
      })
    })

    describe('and the first hash reverts but the prefixed hash is accepted', () => {
      beforeEach(() => {
        sendAsync
          .mockImplementationOnce((payload: JsonRpcRequest, callback: JsonRpcCallback) => {
            callback(null, { id: payload.id, jsonrpc: '2.0', error: { code: 3, message: 'private revert reason' } })
          })
          .mockImplementationOnce(contractAccountThat('accepts'))
      })

      it('should accept the signature after the ordinary EVM revert', async () => {
        await expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).resolves.toBeUndefined()
        expect(sendAsync).toHaveBeenCalledTimes(2)
      })
    })

    describe.each([undefined, null, {}, { result: null }, { result: 'private-provider-secret' }, { error: {} }])(
      'and a custom provider returns malformed data %p',
      (response) => {
        let validation: Promise<void>

        beforeEach(() => {
          sendAsync.mockImplementation((_payload, callback) => callback(null, response))
          validation = validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        })

        it('should fail once with a sanitized infrastructure error', async () => {
          await expect(validation).rejects.toThrow(SignatureValidationInfrastructureError)
          await expect(validation).rejects.toThrow('RPC request failed')
          expect(sendAsync).toHaveBeenCalledTimes(1)
        })
      }
    )

    describe.each(['not-an-address', '0x1234', '0x' + 'z'.repeat(40)])(
      'and the owner address is malformed: %s',
      (owner) => {
        beforeEach(() => {
          authChain[0] = { ...authChain[0], payload: owner }
        })

        it('should reject the owner before issuing RPC requests', async () => {
          await expect(
            validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
          ).rejects.toThrow('Invalid auth chain signer address')
          expect(sendAsync).not.toHaveBeenCalled()
        })
      }
    )

    describe('and the provider cannot be reached', () => {
      it('should reject the chain rather than let it through', async () => {
        await expect(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        ).rejects.toThrow(/RPC request failed/)
      })
    })

    describe.each(['callback error', 'synchronous throw', 'JSON-RPC error response', 'non-revert -32000 response'])(
      'and a custom provider exposes a secret through a %s',
      (failureMode) => {
        let validation: Promise<void>

        beforeEach(() => {
          jest.useFakeTimers()
          sendAsync.mockImplementation((payload: JsonRpcRequest, callback: JsonRpcCallback) => {
            if (failureMode === 'synchronous throw') {
              throw new Error('private-provider-secret')
            }
            if (failureMode === 'JSON-RPC error response' || failureMode === 'non-revert -32000 response') {
              callback(null, {
                id: payload.id,
                jsonrpc: '2.0',
                error: {
                  code: failureMode === 'non-revert -32000 response' ? -32000 : -32603,
                  message: 'private-provider-secret'
                }
              })
              return
            }
            callback(new Error('private-provider-secret'))
          })
          validation = validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        })

        it('should reject without including provider secrets in the helper error', async () => {
          await expect(validation).rejects.toThrow(SignatureValidationInfrastructureError)
          expect(sendAsync).toHaveBeenCalledTimes(1)
          expect(sendAsync.mock.calls[0][2].aborted).toBe(true)
          expect(jest.getTimerCount()).toBe(0)
          await expect(validation).rejects.not.toThrow('private-provider-secret')
        })
      }
    )
  })

  describe('when the chain is empty', () => {
    let authChain: AuthChain

    beforeEach(() => {
      authChain = []
    })

    it('should reject it', async () => {
      await expect(
        validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
      ).rejects.toThrow('Auth chain is required')
    })
  })
})
