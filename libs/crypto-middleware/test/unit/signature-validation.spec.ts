import { AuthLinkType, Authenticator } from '@dcl/crypto'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { SignatureValidationInfrastructureError, validateAuthChainSignature } from '../../src/signature-validation'
import { identity as fixtureIdentity } from '../fixtures/identity'
import type { AuthChainProvider, JsonRpcCallback, JsonRpcRequest, JsonRpcResponse } from '../../src/rpc-provider'
import type { SignatureValidationOptions } from '../../src/signature-validation'

type SendAsync = AuthChainProvider['sendAsync']
type SendAsyncMock = jest.Mock<void, Parameters<SendAsync>>

const MAGIC_VALUE = '0x1626ba7e' + '0'.repeat(56)
const NOT_MAGIC_VALUE = '0x' + '0'.repeat(64)

const settle = (validation: Promise<void>): Promise<Error | undefined> =>
  validation.then(
    () => undefined,
    (error: Error) => error
  )

const answerBlockRequest = (payload: JsonRpcRequest, callback: JsonRpcCallback): void =>
  callback(null, {
    id: payload.id,
    jsonrpc: '2.0',
    result: payload.method === 'eth_blockNumber' ? '0x2' : { timestamp: '0x1', number: '0x2' }
  })

const isLatestBlockCall = (payload: JsonRpcRequest): boolean => payload.params?.[1] === 'latest'

const contractAccountThat =
  (verdict: 'accepts' | 'rejects' | 'accepts only at a historical block'): SendAsync =>
  (payload, callback) => {
    if (payload.method !== 'eth_call') {
      answerBlockRequest(payload, callback)
      return
    }
    const accepts = verdict === 'accepts' || (verdict !== 'rejects' && !isLatestBlockCall(payload))
    callback(null, { id: payload.id, jsonrpc: '2.0', result: accepts ? MAGIC_VALUE : NOT_MAGIC_VALUE })
  }

const contractAccountThatFailsWith =
  (error: unknown): SendAsync =>
  (payload, callback) => {
    if (payload.method !== 'eth_call') {
      answerBlockRequest(payload, callback)
      return
    }
    callback(null, { id: payload.id, jsonrpc: '2.0', error } as unknown as JsonRpcResponse)
  }

const contractWalletChain = (signedLinks: number): AuthChain => [
  fixtureIdentity.authChain[0],
  ...Array.from({ length: signedLinks }, () => ({
    ...fixtureIdentity.authChain[1],
    type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL
  }))
]

const ethCallsOf = (sendAsync: SendAsyncMock): Array<Parameters<SendAsync>> =>
  sendAsync.mock.calls.filter(([payload]) => payload.method === 'eth_call')

describe('when validating an auth chain signature', () => {
  let identity: AuthIdentity
  let sendAsync: SendAsyncMock
  let l1Provider: AuthChainProvider
  let authChain: AuthChain
  let options: SignatureValidationOptions | undefined
  let outcome: Error | undefined

  beforeEach(() => {
    identity = fixtureIdentity
    sendAsync = jest.fn<void, Parameters<SendAsync>>()
    l1Provider = { sendAsync }
    options = undefined
  })

  afterEach(() => {
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('and every link was signed by a plain EOA', () => {
    beforeEach(async () => {
      outcome = await settle(
        validateAuthChainSignature(identity.authChain, identity.ephemeralIdentity.address, l1Provider)
      )
    })

    it('should validate it', () => {
      expect(outcome).toBeUndefined()
    })

    it('should not call the provider', () => {
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })

  describe('and the ephemeral key has expired', () => {
    beforeEach(async () => {
      authChain = [
        identity.authChain[0],
        { ...identity.authChain[1], payload: identity.authChain[1].payload.replace('3021-', '2001-') }
      ]
      outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
    })

    it('should reject it with an error that keeps the expiration diagnostics', () => {
      expect(outcome).toEqual(expect.objectContaining({ message: expect.stringContaining('expired') }))
    })

    it('should not report it as an infrastructure failure', () => {
      expect(outcome).not.toBeInstanceOf(SignatureValidationInfrastructureError)
    })
  })

  describe.each([
    ['empty', (): AuthChain => []],
    ['not an array', (): AuthChain => ({}) as unknown as AuthChain],
    ['a lone SIGNER link', (): AuthChain => [fixtureIdentity.authChain[0]]]
  ])('and the chain is %s', (_description, buildChain) => {
    beforeEach(async () => {
      authChain = buildChain()
      sendAsync.mockImplementation(contractAccountThat('accepts'))
      outcome = await settle(validateAuthChainSignature(authChain, identity.authChain[0].payload, l1Provider))
    })

    it('should reject it as lacking a signed link', () => {
      expect(outcome).toEqual(new Error('Auth chain must contain a signer and at least one signed link'))
    })

    it('should not call the provider', () => {
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })

  describe.each([
    ['maxChainLength', 0],
    ['maxChainLength', 1],
    ['maxChainLength', NaN],
    ['maxChainLength', 1.5],
    ['maxRpcCalls', 0],
    ['maxRpcCalls', NaN],
    ['maxRpcCalls', 1.5],
    ['timeoutInMilliseconds', 0],
    ['timeoutInMilliseconds', NaN],
    ['timeoutInMilliseconds', 1.5],
    ['timeoutInMilliseconds', 2_147_483_648]
  ])('and the %s option is %p', (option, value) => {
    beforeEach(async () => {
      authChain = contractWalletChain(1)
      sendAsync.mockImplementation(contractAccountThat('accepts'))
      options = { [option]: value }
      outcome = await settle(
        validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider, options)
      )
    })

    it('should reject the validation limits', () => {
      expect(outcome?.message).toMatch(/^Validation limits must be/)
    })

    it('should not call the provider', () => {
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })

  describe('and the options are at their accepted boundaries', () => {
    beforeEach(async () => {
      authChain = contractWalletChain(1)
      sendAsync.mockImplementation(contractAccountThat('accepts'))
      options = { maxChainLength: 2, maxRpcCalls: 1, timeoutInMilliseconds: 2_147_483_647 }
      outcome = await settle(
        validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider, options)
      )
    })

    it('should validate the chain', () => {
      expect(outcome).toBeUndefined()
    })
  })

  describe('and the chain was signed by an account with code behind it', () => {
    beforeEach(() => {
      authChain = contractWalletChain(1)
    })

    describe('and the account accepts the signature', () => {
      beforeEach(async () => {
        sendAsync.mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should validate it', () => {
        expect(outcome).toBeUndefined()
      })

      it('should validate it on chain and release its validation signal', () => {
        expect(sendAsync).toHaveBeenCalledWith(
          expect.objectContaining({ method: 'eth_call' }),
          expect.any(Function),
          expect.objectContaining({ aborted: true })
        )
      })
    })

    describe('and the validation has already succeeded', () => {
      let scopedProvider: AuthChainProvider
      let lateCallback: jest.Mock<void, Parameters<JsonRpcCallback>>

      beforeEach(async () => {
        const validateSignature = jest.spyOn(Authenticator, 'validateSignature')
        sendAsync.mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        scopedProvider = validateSignature.mock.calls[0][2] as AuthChainProvider
        lateCallback = jest.fn<void, Parameters<JsonRpcCallback>>()
        scopedProvider.sendAsync({ id: 99, jsonrpc: '2.0', method: 'eth_call', params: [] }, lateCallback)
      })

      it('should answer a late request with an infrastructure error', () => {
        expect(lateCallback).toHaveBeenCalledWith(expect.any(SignatureValidationInfrastructureError))
      })

      it('should not forward the late request to the provider', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the account rejects the signature', () => {
      beforeEach(async () => {
        sendAsync.mockImplementation(contractAccountThat('rejects'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain, since the account did not confirm it', () => {
        expect(outcome?.message).toMatch(/Invalid validation/)
      })

      it('should not report it as an infrastructure failure', () => {
        expect(outcome).not.toBeInstanceOf(SignatureValidationInfrastructureError)
      })

      it('should try both hashes at the latest and at a historical block', () => {
        expect(ethCallsOf(sendAsync)).toHaveLength(4)
      })
    })

    describe('and the provider never answers', () => {
      let validation: Promise<Error | undefined>

      beforeEach(async () => {
        jest.useFakeTimers()
        sendAsync.mockImplementation(() => undefined)
        validation = settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        await jest.advanceTimersByTimeAsync(15_000)
        outcome = await validation
      })

      it('should reject the chain with a timeout infrastructure error', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('Signature validation timed out'))
      })

      it('should reject it as an infrastructure error', () => {
        expect(outcome).toBeInstanceOf(SignatureValidationInfrastructureError)
      })

      it('should abort the signal passed to the provider', () => {
        expect(sendAsync.mock.calls[0][2]?.aborted).toBe(true)
      })

      it('should leave no pending timers', () => {
        expect(jest.getTimerCount()).toBe(0)
      })
    })

    describe('and the provider answers a pending request after a custom deadline', () => {
      let scopedProvider: AuthChainProvider
      let lateCallback: jest.Mock<void, Parameters<JsonRpcCallback>>
      let validation: Promise<Error | undefined>

      beforeEach(async () => {
        jest.useFakeTimers()
        const validateSignature = jest.spyOn(Authenticator, 'validateSignature')
        sendAsync.mockImplementation(() => undefined)
        validation = settle(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider, {
            timeoutInMilliseconds: 1_000
          })
        )
        scopedProvider = validateSignature.mock.calls[0][2] as AuthChainProvider
        lateCallback = jest.fn<void, Parameters<JsonRpcCallback>>()
        scopedProvider.sendAsync({ id: 99, jsonrpc: '2.0', method: 'eth_call', params: [] }, lateCallback)
        await jest.advanceTimersByTimeAsync(1_000)
        outcome = await validation
        const [, pendingCallback] = sendAsync.mock.calls.find(([payload]) => payload.id === 99) ?? []
        pendingCallback?.(null, { id: 99, jsonrpc: '2.0', result: MAGIC_VALUE })
      })

      it('should reject the chain once the custom deadline passes', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('Signature validation timed out'))
      })

      it('should answer the late response with an infrastructure error', () => {
        expect(lateCallback).toHaveBeenCalledWith(expect.any(SignatureValidationInfrastructureError))
      })
    })

    describe('and a successful RPC response arrives after the deadline', () => {
      beforeEach(async () => {
        jest.useFakeTimers()
        authChain = contractWalletChain(2)
        sendAsync.mockImplementation((payload, callback) => {
          setTimeout(() => contractAccountThat('accepts')(payload, callback), 16_000)
        })
        const validation = settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        await jest.advanceTimersByTimeAsync(15_000)
        outcome = await validation
        await jest.advanceTimersByTimeAsync(10_000)
      })

      it('should reject the chain with a timeout infrastructure error', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('Signature validation timed out'))
      })

      it('should prevent subsequent chain links from issuing RPC requests', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })
    })

    describe('and another validation starts before the first validation times out', () => {
      let firstOutcome: Error | undefined
      let secondOutcome: Error | undefined
      let firstSignalAborted: boolean | undefined
      let secondSignalAbortedAfterFirstTimeout: boolean | undefined

      beforeEach(async () => {
        jest.useFakeTimers()
        sendAsync
          .mockImplementationOnce(() => undefined)
          .mockImplementationOnce((payload, callback) => {
            setTimeout(() => contractAccountThat('accepts')(payload, callback), 10_000)
          })
        const firstValidation = settle(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        )
        await jest.advanceTimersByTimeAsync(10_000)
        const secondValidation = settle(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider)
        )
        await jest.advanceTimersByTimeAsync(5_000)
        firstOutcome = await firstValidation
        firstSignalAborted = sendAsync.mock.calls[0][2]?.aborted
        secondSignalAbortedAfterFirstTimeout = sendAsync.mock.calls[1][2]?.aborted
        await jest.advanceTimersByTimeAsync(5_000)
        secondOutcome = await secondValidation
      })

      it('should time out the first validation', () => {
        expect(firstOutcome).toEqual(new SignatureValidationInfrastructureError('Signature validation timed out'))
      })

      it('should abort only the first validation signal', () => {
        expect([firstSignalAborted, secondSignalAbortedAfterFirstTimeout]).toEqual([true, false])
      })

      it('should validate the second chain', () => {
        expect(secondOutcome).toBeUndefined()
      })
    })

    describe('and the chain has exactly the maximum number of links', () => {
      beforeEach(async () => {
        authChain = contractWalletChain(9)
        sendAsync.mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should validate every contract signature', () => {
        expect(outcome).toBeUndefined()
      })

      it('should make one RPC call per contract signature', () => {
        expect(sendAsync).toHaveBeenCalledTimes(9)
      })
    })

    describe('and the chain exceeds the default link limit', () => {
      beforeEach(async () => {
        authChain = contractWalletChain(10)
        sendAsync.mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain', () => {
        expect(outcome).toEqual(new Error('Auth chain exceeds maximum length of 10'))
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })

    describe('and the chain exceeds a custom link limit', () => {
      beforeEach(async () => {
        authChain = contractWalletChain(3)
        sendAsync.mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider, { maxChainLength: 3 })
        )
      })

      it('should reject the chain', () => {
        expect(outcome).toEqual(new Error('Auth chain exceeds maximum length of 3'))
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })

    describe('and its contract signatures need more RPC calls than the default budget', () => {
      beforeEach(async () => {
        authChain = contractWalletChain(3)
        sendAsync.mockImplementation(contractAccountThat('accepts only at a historical block'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain as exceeding the budget', () => {
        expect(outcome).toEqual(new Error('Auth chain validation exceeded 16 RPC calls'))
      })

      it('should not report it as an infrastructure failure', () => {
        expect(outcome).not.toBeInstanceOf(SignatureValidationInfrastructureError)
      })

      it('should send exactly the budgeted number of calls to the provider', () => {
        expect(sendAsync).toHaveBeenCalledTimes(16)
      })
    })

    describe('and its contract signature needs more RPC calls than a custom budget', () => {
      beforeEach(async () => {
        sendAsync.mockImplementation(contractAccountThat('rejects'))
        outcome = await settle(
          validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider, { maxRpcCalls: 3 })
        )
      })

      it('should reject the chain as exceeding the budget', () => {
        expect(outcome).toEqual(new Error('Auth chain validation exceeded 3 RPC calls'))
      })

      it('should send exactly the budgeted number of calls to the provider', () => {
        expect(sendAsync).toHaveBeenCalledTimes(3)
      })
    })

    describe.each([
      [{ code: 3, message: 'execution reverted' }],
      [{ code: -32015, message: 'VM execution error.' }],
      [{ code: -32603, message: 'Error: VM Exception while processing transaction: reverted with reason string' }],
      [{ code: -32000, message: 'invalid opcode: INVALID' }],
      [{ code: -32000, message: 'EVM error InvalidFEOpcode' }],
      [{ code: -32000, message: 'execution reverted' }]
    ])('and eth_call fails with the contract execution error %p', (error) => {
      describe('and every call fails that way', () => {
        beforeEach(async () => {
          sendAsync.mockImplementation(contractAccountThatFailsWith(error))
          outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        })

        it('should reject the chain as an invalid signature', () => {
          expect(outcome?.message).toMatch(/Invalid validation/)
        })

        it('should not report it as an infrastructure failure', () => {
          expect(outcome).not.toBeInstanceOf(SignatureValidationInfrastructureError)
        })

        it('should try the prefixed and historical checks', () => {
          expect(ethCallsOf(sendAsync)).toHaveLength(4)
        })
      })

      describe('and only the unprefixed hash fails that way while the prefixed hash is accepted', () => {
        beforeEach(async () => {
          sendAsync
            .mockImplementationOnce(contractAccountThatFailsWith(error))
            .mockImplementationOnce(contractAccountThat('accepts'))
          outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        })

        it('should validate the chain', () => {
          expect(outcome).toBeUndefined()
        })

        it('should only call the contract for both hashes', () => {
          expect(sendAsync).toHaveBeenCalledTimes(2)
        })
      })
    })

    describe.each([
      [{ code: 3, message: 'private revert reason' }, 3],
      [{ code: -32000, message: 'execution reverted: private revert reason' }, -32000],
      [{ message: 'VM Exception while processing transaction: revert private revert reason' }, 3]
    ])('and eth_call reverts with the private reason %p', (error, expectedCode) => {
      let scopedResponse: JsonRpcResponse | undefined

      beforeEach(async () => {
        const validateSignature = jest.spyOn(Authenticator, 'validateSignature')
        sendAsync.mockImplementation(contractAccountThatFailsWith(error))
        const validation = settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        const scopedProvider = validateSignature.mock.calls[0][2] as AuthChainProvider
        scopedProvider.sendAsync({ id: 99, jsonrpc: '2.0', method: 'eth_call', params: [] }, (_error, response) => {
          scopedResponse = response
        })
        outcome = await validation
      })

      it('should hand crypto a fixed revert message instead of the private reason', () => {
        expect(scopedResponse).toEqual({
          jsonrpc: '2.0',
          id: 99,
          error: { code: expectedCode, message: 'execution reverted' }
        })
      })

      it('should not include the private reason in the rejection', () => {
        expect(outcome?.message).not.toContain('private revert reason')
      })

      it('should reject the chain as an invalid signature', () => {
        expect(outcome).not.toBeInstanceOf(SignatureValidationInfrastructureError)
      })
    })

    describe.each([
      [{ code: -32005, message: 'limit exceeded' }],
      [{ code: -32000, message: 'header not found' }],
      [{ code: -32000, message: 'out of gas' }],
      [{ code: -32000, message: 'missing trie node' }],
      [{ code: -32603, message: 'internal error' }],
      [{ code: -32603, message: 'private-provider-secret' }],
      [{}],
      ['private-provider-secret']
    ])('and eth_call fails with the node error %p', (error) => {
      beforeEach(async () => {
        sendAsync.mockImplementation(contractAccountThatFailsWith(error))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain with a sanitized infrastructure error', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('RPC request failed'))
      })

      it('should reject it as an infrastructure error', () => {
        expect(outcome).toBeInstanceOf(SignatureValidationInfrastructureError)
      })

      it('should stop after the failed call', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })
    })

    describe.each(['eth_getBlockByNumber', 'eth_blockNumber'])(
      'and %s fails with a contract execution error',
      (method) => {
        beforeEach(async () => {
          sendAsync.mockImplementation((payload, callback) => {
            if (payload.method === method) {
              callback(null, { id: payload.id, jsonrpc: '2.0', error: { code: 3, message: 'execution reverted' } })
              return
            }
            contractAccountThat('rejects')(payload, callback)
          })
          outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
        })

        it('should reject the chain with an infrastructure error', () => {
          expect(outcome).toEqual(new SignatureValidationInfrastructureError('RPC request failed'))
        })
      }
    )

    describe.each([
      ['eth_call', undefined],
      ['eth_call', null],
      ['eth_call', []],
      ['eth_call', {}],
      ['eth_call', { result: null }],
      ['eth_call', { result: 'private-provider-secret' }],
      ['eth_call', { result: '0x' + '00'.repeat(33) }],
      ['eth_blockNumber', { result: 'not-hex' }],
      ['eth_blockNumber', { result: 2 }],
      ['eth_getBlockByNumber', { result: null }],
      ['eth_getBlockByNumber', { result: [] }],
      ['eth_getBlockByNumber', { result: { number: '0x2' } }],
      ['eth_getBlockByNumber', { result: { timestamp: 'not-hex' } }]
    ])('and a custom provider answers %s with the malformed response %p', (method, response) => {
      beforeEach(async () => {
        sendAsync.mockImplementation((payload, callback) => {
          if (payload.method === method) {
            callback(null, response as unknown as JsonRpcResponse)
            return
          }
          contractAccountThat('rejects')(payload, callback)
        })
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain with a sanitized infrastructure error', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('RPC request failed'))
      })

      it('should reject it as an infrastructure error', () => {
        expect(outcome).toBeInstanceOf(SignatureValidationInfrastructureError)
      })

      it('should stop after the malformed response', () => {
        expect(sendAsync.mock.calls[sendAsync.mock.calls.length - 1][0].method).toBe(method)
      })
    })

    describe.each([
      'not-an-address',
      '0x1234',
      '0x' + 'z'.repeat(40),
      '7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5',
      '0x' + 'a'.repeat(39),
      42
    ])('and the signer address is malformed: %p', (signer) => {
      beforeEach(async () => {
        authChain[0] = { ...authChain[0], payload: signer as string }
        sendAsync.mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the signer', () => {
        expect(outcome).toEqual(new Error('Invalid auth chain signer address'))
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })

    describe.each(['callback error', 'synchronous throw'])('and a custom provider fails with a %s', (failureMode) => {
      beforeEach(async () => {
        jest.useFakeTimers()
        sendAsync.mockImplementation((_payload, callback) => {
          if (failureMode === 'synchronous throw') {
            throw new Error('private-provider-secret')
          }
          callback(new Error('private-provider-secret'))
        })
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain with a sanitized infrastructure error', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('RPC request failed'))
      })

      it('should not include the provider error text in the rejection', () => {
        expect(outcome?.message).not.toContain('private-provider-secret')
      })

      it('should stop after the failed call', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })

      it('should abort the signal passed to the provider', () => {
        expect(sendAsync.mock.calls[0][2]?.aborted).toBe(true)
      })

      it('should leave no pending timers', () => {
        expect(jest.getTimerCount()).toBe(0)
      })
    })

    describe('and the provider fails once but the account would accept the signature on a later call', () => {
      beforeEach(async () => {
        sendAsync
          .mockImplementationOnce((_payload, callback) => callback(new Error('Temporarily unavailable')))
          .mockImplementation(contractAccountThat('accepts'))
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should reject the chain with an infrastructure error instead of validating it', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('RPC request failed'))
      })

      it('should not send the later call to the provider', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })
    })

    describe('and the provider answers the same request twice', () => {
      beforeEach(async () => {
        sendAsync.mockImplementation((payload, callback) => {
          contractAccountThat('accepts')(payload, callback)
          contractAccountThat('accepts')(payload, callback)
        })
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should validate the chain once', () => {
        expect(outcome).toBeUndefined()
      })
    })

    describe('and the provider reports an error and then throws for the same request', () => {
      beforeEach(async () => {
        sendAsync.mockImplementation((_payload, callback) => {
          callback(new Error('First failure'))
          throw new Error('Second failure')
        })
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should settle once with a sanitized infrastructure error', () => {
        expect(outcome).toEqual(new SignatureValidationInfrastructureError('RPC request failed'))
      })
    })

    describe('and the provider answers the same request twice with different outcomes', () => {
      beforeEach(async () => {
        sendAsync.mockImplementation((payload, callback) => {
          contractAccountThat('accepts')(payload, callback)
          callback(new Error('Late failure'))
        })
        outcome = await settle(validateAuthChainSignature(authChain, identity.ephemeralIdentity.address, l1Provider))
      })

      it('should settle with an infrastructure error rather than crash', () => {
        expect(outcome).toBeInstanceOf(SignatureValidationInfrastructureError)
      })
    })
  })
})
