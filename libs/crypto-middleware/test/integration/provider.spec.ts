import type { IFetchComponent } from '@dcl/core-commons'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { wellKnownComponents } from '../../src/index'
import * as signatureValidation from '../../src/internal-signature-validation'
import { rejectIfSigner } from '../../src/metadataValidators'
import { AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '../../src/types'
import verify, { createLegacyPayload, createPayload } from '../../src/verify'
import { identity, ownerAddress } from '../fixtures/identity'
import type RequestError from '../../src/errors'
import type { AuthChainProvider, JsonRpcRequest, JsonRpcResponse } from '../../src/rpc-provider'
import type { DecentralandSignatureData, Options } from '../../src/types'

type Middleware = ReturnType<typeof wellKnownComponents>
type MiddlewareContext = Parameters<Middleware>[0]
type MiddlewareResponse = Awaited<ReturnType<Middleware>>
interface Outcome {
  value?: DecentralandSignatureData
  error?: RequestError
}

const METHOD = 'POST'
const PATH = '/identities'
const MAGIC_VALUE = '0x1626ba7e' + '0'.repeat(56)
const ZERO_WORD = '0x' + '0'.repeat(64)
const CHECKSUMMED_OWNER = '0x7949f9F239D1a0816ce5Eb364A1F588AE9Cc1Bf5'
const DEFAULT_MAX_RPC_CALLS = 16

function rpcResult(request: JsonRpcRequest, result: unknown): JsonRpcResponse {
  return { id: request.id, jsonrpc: '2.0', result }
}

function rpcError(request: JsonRpcRequest, code: number, message: string): JsonRpcResponse {
  return { id: request.id, jsonrpc: '2.0', error: { code, message } }
}

/** Block 1 is 1000s old and the latest block 1s old, relative to the request timestamp. */
function blockResponse(request: JsonRpcRequest, timestamp: number): JsonRpcResponse {
  const isFirstBlock = request.params?.[0] === '0x1'
  return rpcResult(request, {
    number: isFirstBlock ? '0x1' : '0x64',
    timestamp: '0x' + (Math.floor(timestamp / 1000) - (isFirstBlock ? 1000 : 1)).toString(16),
    transactions: []
  })
}

/** A node hosting the signer contract; `answerCall` receives the zero-based eth_call index. */
function contractWallet(
  timestamp: number,
  answerCall: (request: JsonRpcRequest, callIndex: number) => JsonRpcResponse
): AuthChainProvider['sendAsync'] {
  let callIndex = 0
  return (request, callback) => {
    if (request.method === 'eth_getBlockByNumber') {
      callback(null, blockResponse(request, timestamp))
    } else if (request.method === 'eth_blockNumber') {
      callback(null, rpcResult(request, '0x64'))
    } else {
      callback(null, answerCall(request, callIndex++))
    }
  }
}

async function settle(promise: Promise<DecentralandSignatureData>): Promise<Outcome> {
  try {
    return { value: await promise }
  } catch (error) {
    return { error: error as RequestError }
  }
}

function requestContext(headers: Record<string, string>): MiddlewareContext {
  return {
    request: new Request('http://localhost' + PATH, { method: METHOD, headers }),
    url: new URL('http://localhost' + PATH)
  } as MiddlewareContext
}

function ethCallCount(sendAsync: jest.MockedFunction<AuthChainProvider['sendAsync']>): number {
  return sendAsync.mock.calls.filter(([request]) => request.method === 'eth_call').length
}

describe('when verifying contract signatures with a supplied provider', () => {
  let provider: AuthChainProvider
  let sendAsync: jest.MockedFunction<AuthChainProvider['sendAsync']>
  let fetcher: IFetchComponent
  let fetchMock: jest.MockedFunction<IFetchComponent['fetch']>
  let contractIdentity: AuthIdentity
  let chain: AuthChain
  let headers: Record<string, string>
  let timestamp: number
  let metadata: Record<string, unknown>
  let payload: string
  let options: Omit<Options, 'service' | 'operation' | 'resource' | 'maxScopedLoginLifetime'>
  let outcome: Outcome

  beforeEach(() => {
    timestamp = Date.now()
    metadata = { intent: 'ContractLogin' }
    payload = createPayload(METHOD, PATH, String(timestamp), JSON.stringify(metadata))
    contractIdentity = {
      ...identity,
      authChain: [identity.authChain[0], { ...identity.authChain[1], type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL }]
    }
    chain = Authenticator.signPayload(contractIdentity, payload)
    headers = createAuthChainHeaders(chain, timestamp, metadata)
    sendAsync = jest.fn()
    provider = { sendAsync }
    fetchMock = jest.fn()
    fetchMock.mockRejectedValue(new Error('Unexpected Catalyst request'))
    fetcher = { fetch: fetchMock }
    options = { provider, fetcher }
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.restoreAllMocks()
    jest.useRealTimers()
  })

  describe('and the contract accepts its delegation signature', () => {
    beforeEach(() => {
      sendAsync.mockImplementation(contractWallet(timestamp, (request) => rpcResult(request, MAGIC_VALUE)))
    })

    describe('and the request is verified', () => {
      beforeEach(async () => {
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should authenticate the owner with the delivered metadata', () => {
        expect(outcome.value).toEqual({ auth: ownerAddress, authMetadata: metadata })
      })

      it('should validate the delegation with a single RPC call', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })

      it('should not consult Catalyst', () => {
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })

    describe('and the signer address is mixed-case checksummed', () => {
      beforeEach(async () => {
        chain[0] = { ...chain[0], payload: CHECKSUMMED_OWNER }
        headers = createAuthChainHeaders(chain, timestamp, metadata)
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should authenticate the lowercased owner address', () => {
        expect(outcome.value?.auth).toBe(ownerAddress)
      })
    })

    describe('and the signed payload is changed after signing', () => {
      beforeEach(async () => {
        headers[AUTH_METADATA_HEADER] = JSON.stringify({ intent: 'ChangedIntent' })
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should reject the ephemeral signature with a 401 even though the contract accepts the delegation', () => {
        expect(outcome.error).toMatchObject({ statusCode: 401 })
      })
    })

    describe('and the ephemeral entity signature is invalid', () => {
      beforeEach(async () => {
        chain[2].signature = '0x' + '00'.repeat(65)
        headers = createAuthChainHeaders(chain, timestamp, metadata)
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should reject the full chain with a 401', () => {
        expect(outcome.error).toMatchObject({ statusCode: 401 })
      })
    })

    describe('and the request uses the legacy payload with declared canonical keys', () => {
      beforeEach(() => {
        chain = Authenticator.signPayload(contractIdentity, payload.toLowerCase())
        headers = createAuthChainHeaders(chain, timestamp, metadata)
        options = { ...options, canonicalMetadataKeys: ['intent'] }
      })

      describe('and the metadata keys are canonical', () => {
        beforeEach(async () => {
          outcome = await settle(verify(METHOD, PATH, headers, options))
        })

        it('should accept the legacy payload validated through the provider', () => {
          expect(outcome.value).toEqual({ auth: ownerAddress, authMetadata: metadata })
        })

        it('should not consult Catalyst', () => {
          expect(fetchMock).not.toHaveBeenCalled()
        })
      })

      describe('and a declared metadata key is recased', () => {
        beforeEach(async () => {
          headers[AUTH_METADATA_HEADER] = JSON.stringify({ Intent: 'ContractLogin' })
          outcome = await settle(verify(METHOD, PATH, headers, options))
        })

        it('should reject the metadata with a 400 before accepting the legacy payload', () => {
          expect(outcome.error).toMatchObject({ statusCode: 400 })
        })
      })
    })

    describe('and the request timestamp has expired', () => {
      beforeEach(async () => {
        headers[AUTH_TIMESTAMP_HEADER] = String(timestamp - 120_000)
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should reject the request with a 401', () => {
        expect(outcome.error).toMatchObject({ statusCode: 401 })
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })

    describe('and the metadata validator forbids the signer', () => {
      beforeEach(async () => {
        headers[AUTH_METADATA_HEADER] = JSON.stringify({ signer: 'decentraland-kernel-scene' })
        options = { ...options, metadataValidator: rejectIfSigner('decentraland-kernel-scene') }
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should reject the request with a 400', () => {
        expect(outcome.error).toMatchObject({ statusCode: 400 })
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the contract rejects the signature', () => {
    beforeEach(() => {
      sendAsync.mockImplementation(contractWallet(timestamp, (request) => rpcResult(request, ZERO_WORD)))
    })

    describe('and the request is verified', () => {
      beforeEach(async () => {
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should fail closed with a 401', () => {
        expect(outcome.error).toMatchObject({ statusCode: 401 })
      })

      it('should not fall back to Catalyst', () => {
        expect(fetchMock).not.toHaveBeenCalled()
      })

      it('should check the signature with and without the message prefix, at the latest and the dated block', () => {
        expect(ethCallCount(sendAsync)).toBe(4)
      })
    })

    describe('and the canonical metadata keys are declared', () => {
      let validateSpy: jest.SpiedFunction<typeof signatureValidation.validateScopedAuthChainSignature>

      beforeEach(async () => {
        validateSpy = jest.spyOn(signatureValidation, 'validateScopedAuthChainSignature')
        options = { ...options, canonicalMetadataKeys: ['intent'] }
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should reject the request with a 401', () => {
        expect(outcome.error).toMatchObject({ statusCode: 401 })
      })

      it('should retry the validation exactly once against the legacy payload', () => {
        expect(validateSpy.mock.calls.map(([, finalAuthority]) => finalAuthority)).toEqual([
          payload,
          createLegacyPayload(METHOD, PATH, String(timestamp), JSON.stringify(metadata))
        ])
      })

      it('should keep the RPC calls of both validations within two call budgets', () => {
        expect(sendAsync.mock.calls.length).toBeLessThanOrEqual(2 * DEFAULT_MAX_RPC_CALLS)
      })
    })
  })

  describe('and the contract reverts the unprefixed hash with a Nethermind error before accepting the prefixed one', () => {
    let next: jest.MockedFunction<Parameters<Middleware>[1]>
    let context: MiddlewareContext
    let response: MiddlewareResponse

    beforeEach(async () => {
      sendAsync.mockImplementation(
        contractWallet(timestamp, (request, callIndex) =>
          callIndex === 0 ? rpcError(request, -32015, 'VM execution error.') : rpcResult(request, MAGIC_VALUE)
        )
      )
      next = jest.fn()
      next.mockResolvedValueOnce({ status: 200 })
      context = requestContext(headers)
      response = await wellKnownComponents(options)(context, next)
    })

    it('should let the request through to the handler', () => {
      expect(response).toEqual({ status: 200 })
    })

    it('should authenticate the request as the lowercased contract address', () => {
      expect(context.verification?.auth).toBe(ownerAddress)
    })
  })

  describe('and the contract reverts during signature validation', () => {
    beforeEach(async () => {
      sendAsync.mockImplementation(contractWallet(timestamp, (request) => rpcError(request, 3, 'execution reverted')))
      outcome = await settle(verify(METHOD, PATH, headers, options))
    })

    it('should treat the revert as an invalid signature with a 401 rather than a service outage', () => {
      expect(outcome.error).toMatchObject({ statusCode: 401 })
    })
  })

  describe('and the contract revert carries upstream text', () => {
    let response: MiddlewareResponse

    beforeEach(async () => {
      sendAsync.mockImplementation(
        contractWallet(timestamp, (request) => rpcError(request, 3, 'execution reverted: SECRET-TOKEN'))
      )
      response = await wellKnownComponents(options)(requestContext(headers), jest.fn())
    })

    it('should respond with a 401', () => {
      expect(response.status).toBe(401)
    })

    it('should not disclose the upstream text in the response', () => {
      expect(JSON.stringify(response)).not.toContain('SECRET-TOKEN')
    })
  })

  describe('and every RPC call of a long EIP-1654 chain needs the prefixed fallback', () => {
    beforeEach(async () => {
      const contractLinks = Array.from({ length: 8 }, (_, index) => ({
        type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY,
        payload: index === 7 ? payload : '0x' + String(index + 1).repeat(40),
        signature: '0x' + 'ab'.repeat(65)
      }))
      chain = [...contractIdentity.authChain, ...contractLinks]
      headers = createAuthChainHeaders(chain, timestamp, metadata)
      sendAsync.mockImplementation(
        contractWallet(timestamp, (request, callIndex) => rpcResult(request, callIndex % 2 ? MAGIC_VALUE : ZERO_WORD))
      )
    })

    describe('and the default RPC call budget applies', () => {
      beforeEach(async () => {
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should reject the chain as invalid with a 401 rather than a service outage', () => {
        expect(outcome.error).toMatchObject({
          statusCode: 401,
          message: `Invalid signature: Auth chain validation exceeded ${DEFAULT_MAX_RPC_CALLS} RPC calls`
        })
      })

      it('should stop forwarding calls to the provider once the budget is spent', () => {
        expect(sendAsync).toHaveBeenCalledTimes(DEFAULT_MAX_RPC_CALLS)
      })
    })

    describe('and the middleware raises maxRpcCalls to fit the chain', () => {
      beforeEach(async () => {
        outcome = await settle(verify(METHOD, PATH, headers, { ...options, maxRpcCalls: 20 }))
      })

      it('should authenticate the owner of the contract wallet', () => {
        expect(outcome.value?.auth).toBe(ownerAddress.toLowerCase())
      })

      it('should spend two calls per contract link', () => {
        expect(sendAsync).toHaveBeenCalledTimes(18)
      })
    })
  })

  describe('and the provider fails with an error carrying upstream text', () => {
    beforeEach(() => {
      sendAsync.mockImplementation((_request, callback) =>
        callback(new Error('Cannot connect to https://rpc-user:SECRET-TOKEN@example.invalid'))
      )
    })

    describe('and the request is verified with declared canonical keys', () => {
      beforeEach(async () => {
        options = { ...options, canonicalMetadataKeys: ['intent'] }
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should report the verification as unavailable with a 503', () => {
        expect(outcome.error).toMatchObject({ statusCode: 503, message: 'Signature verification unavailable' })
      })

      it('should not retry the legacy payload', () => {
        expect(sendAsync).toHaveBeenCalledTimes(1)
      })

      it('should not fall back to Catalyst', () => {
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })

    describe('and the middleware requires a signature', () => {
      let next: jest.MockedFunction<Parameters<Middleware>[1]>
      let response: MiddlewareResponse

      beforeEach(() => {
        next = jest.fn()
      })

      describe('and it formats errors with their message', () => {
        beforeEach(async () => {
          options = {
            ...options,
            canonicalMetadataKeys: ['intent'],
            onError: (error) => ({ ok: false, message: error.message })
          }
          response = await wellKnownComponents(options)(requestContext(headers), next)
        })

        it('should respond with a 503 and the unavailable message', () => {
          expect(response).toEqual({ status: 503, body: { ok: false, message: 'Signature verification unavailable' } })
        })

        it('should not retry the legacy payload', () => {
          expect(sendAsync).toHaveBeenCalledTimes(1)
        })

        it('should not call the next handler', () => {
          expect(next).not.toHaveBeenCalled()
        })
      })

      describe('and it uses the default error format', () => {
        beforeEach(async () => {
          response = await wellKnownComponents(options)(requestContext(headers), next)
        })

        it('should respond with a 503 and a generic message', () => {
          expect(response).toEqual({ status: 503, body: { ok: false, message: 'Internal error' } })
        })

        it('should not disclose the upstream text in the response', () => {
          expect(JSON.stringify(response)).not.toMatch(/rpc-user|SECRET-TOKEN|example\.invalid/)
        })
      })
    })

    describe('and the middleware is optional', () => {
      let next: jest.MockedFunction<Parameters<Middleware>[1]>
      let context: MiddlewareContext
      let response: MiddlewareResponse

      beforeEach(async () => {
        next = jest.fn()
        next.mockResolvedValueOnce({ status: 200 })
        context = requestContext(headers)
        response = await wellKnownComponents({ ...options, optional: true })(context, next)
      })

      it('should hand the request to the next handler', () => {
        expect(response).toEqual({ status: 200 })
      })

      it('should leave the request unauthenticated', () => {
        expect(context.verification).toBeUndefined()
      })
    })
  })

  describe('and the provider never answers', () => {
    beforeEach(async () => {
      jest.useFakeTimers()
      options = { ...options, canonicalMetadataKeys: ['intent'] }
      const pending = settle(verify(METHOD, PATH, headers, options))
      await jest.advanceTimersByTimeAsync(15_000)
      outcome = await pending
    })

    it('should report the verification as unavailable with a 503 after the deadline', () => {
      expect(outcome.error).toMatchObject({ statusCode: 503, message: 'Signature verification unavailable' })
    })

    it('should not start a legacy retry', () => {
      expect(sendAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe.each([
    ['too short', 'aabb'],
    ['missing its 0x prefix', ownerAddress.slice(2)],
    ['not hexadecimal', '0x' + 'g'.repeat(40)]
  ])('and the signer address is %s', (_case, signerAddress) => {
    beforeEach(async () => {
      chain[0] = { ...chain[0], payload: signerAddress }
      headers = createAuthChainHeaders(chain, timestamp, metadata)
      outcome = await settle(verify(METHOD, PATH, headers, options))
    })

    it('should reject the signer with a 401', () => {
      expect(outcome.error).toMatchObject({ statusCode: 401 })
    })

    it('should not issue an RPC request', () => {
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })

  describe('and every signature comes from an EOA', () => {
    beforeEach(() => {
      chain = Authenticator.signPayload(identity, payload)
      headers = createAuthChainHeaders(chain, timestamp, metadata)
    })

    describe('and the delegation is current', () => {
      beforeEach(async () => {
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should authenticate the owner offline', () => {
        expect(outcome.value?.auth).toBe(ownerAddress)
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })

      it('should not consult Catalyst', () => {
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })

    describe('and the ephemeral delegation has expired', () => {
      beforeEach(async () => {
        chain[1] = {
          ...chain[1],
          payload: chain[1].payload.replace('3021-10-16T22:32:29.626Z', '2000-01-01T00:00:00.000Z')
        }
        headers = createAuthChainHeaders(chain, timestamp, metadata)
        outcome = await settle(verify(METHOD, PATH, headers, options))
      })

      it('should retain the expiry diagnosis used by clients to renew their identity', () => {
        expect(outcome.error).toMatchObject({
          statusCode: 401,
          message: expect.stringMatching(/^Invalid signature: .*Ephemeral key expired/)
        })
      })

      it('should not call the provider', () => {
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the provider option is omitted', () => {
    beforeEach(async () => {
      fetchMock.mockReset()
      fetchMock.mockResolvedValueOnce(Response.json({ valid: true, ownerAddress }))
      outcome = await settle(verify(METHOD, PATH, headers, { fetcher }))
    })

    it('should authenticate the owner through Catalyst', () => {
      expect(outcome.value?.auth).toBe(ownerAddress)
    })

    it('should send the chain and payload to the default Catalyst', () => {
      expect(fetchMock).toHaveBeenCalledWith(
        'https://peer.decentraland.org/lambdas/crypto/validate-signature',
        expect.objectContaining({ body: JSON.stringify({ authChain: chain, timestamp: payload }) })
      )
    })

    it('should not call the provider', () => {
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })
})

describe('when creating the middleware with a provider', () => {
  let provider: AuthChainProvider
  let maxChainLength: number | undefined
  let creation: Error | undefined

  beforeEach(() => {
    provider = { sendAsync: jest.fn() }
  })

  describe.each([0, 1, 1.5, NaN])('and maxChainLength is %p', (value) => {
    beforeEach(() => {
      maxChainLength = value
      try {
        wellKnownComponents({ provider, maxChainLength })
        creation = undefined
      } catch (error) {
        creation = error as Error
      }
    })

    it('should reject the configuration at construction', () => {
      expect(creation?.message).toBe('maxChainLength must be an integer of at least 2 when a provider is set')
    })
  })

  describe.each([undefined, 2, 10])('and maxChainLength is %p', (value) => {
    beforeEach(() => {
      maxChainLength = value
      try {
        wellKnownComponents({ provider, maxChainLength })
        creation = undefined
      } catch (error) {
        creation = error as Error
      }
    })

    it('should create the middleware', () => {
      expect(creation).toBeUndefined()
    })
  })

  describe.each([0, -1, 1.5, NaN])('and maxRpcCalls is %p', (value) => {
    beforeEach(() => {
      try {
        wellKnownComponents({ provider, maxRpcCalls: value })
        creation = undefined
      } catch (error) {
        creation = error as Error
      }
    })

    it('should reject the configuration at construction', () => {
      expect(creation?.message).toBe('maxRpcCalls must be a positive integer')
    })
  })

  describe.each([undefined, 1, 32])('and maxRpcCalls is %p', (value) => {
    beforeEach(() => {
      try {
        wellKnownComponents({ provider, maxRpcCalls: value })
        creation = undefined
      } catch (error) {
        creation = error as Error
      }
    })

    it('should create the middleware', () => {
      expect(creation).toBeUndefined()
    })
  })
})
