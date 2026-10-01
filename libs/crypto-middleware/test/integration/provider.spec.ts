import type { IFetchComponent } from '@dcl/core-commons'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { wellKnownComponents } from '../../src/index'
import { rejectIfSigner } from '../../src/metadataValidators'
import { AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER } from '../../src/types'
import verify, { createPayload } from '../../src/verify'
import { identity, ownerAddress } from '../fixtures/identity'
import type { AuthChainProvider } from '../../src/rpc-provider'

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

  beforeEach(() => {
    timestamp = Date.now()
    metadata = { intent: 'ContractLogin' }
    payload = createPayload('POST', '/identities', String(timestamp), JSON.stringify(metadata))
    contractIdentity = {
      ...identity,
      authChain: [identity.authChain[0], { ...identity.authChain[1], type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL }]
    }
    chain = Authenticator.signPayload(contractIdentity, payload)
    headers = createAuthChainHeaders(chain, timestamp, metadata)
    sendAsync = jest.fn()
    provider = { sendAsync }
    fetchMock = jest.fn().mockRejectedValue(new Error('Unexpected Catalyst request'))
    fetcher = { fetch: fetchMock }
  })

  afterEach(() => {
    jest.resetAllMocks()
    jest.useRealTimers()
  })

  describe('and the contract accepts its delegation signature', () => {
    beforeEach(() => {
      sendAsync.mockImplementation((request, callback) => {
        callback(null, { id: request.id, jsonrpc: '2.0', result: '0x1626ba7e' + '0'.repeat(56) })
      })
    })

    it('should verify the complete chain using the supplied provider without consulting Catalyst', async () => {
      await expect(verify('POST', '/identities', headers, { provider, fetcher })).resolves.toEqual({
        auth: ownerAddress,
        authMetadata: metadata
      })
      expect(sendAsync).toHaveBeenCalledTimes(1)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    describe('and the signed payload is changed after signing', () => {
      beforeEach(() => {
        headers[AUTH_METADATA_HEADER] = JSON.stringify({ intent: 'ChangedIntent' })
      })

      it('should reject the ephemeral signature even though the contract accepts the delegation', async () => {
        await expect(verify('POST', '/identities', headers, { provider, fetcher })).rejects.toMatchObject({
          statusCode: 401
        })
      })
    })

    describe('and the ephemeral entity signature is invalid', () => {
      beforeEach(() => {
        chain[2].signature = '0x' + '00'.repeat(65)
        headers = createAuthChainHeaders(chain, timestamp, metadata)
      })

      it('should reject the full chain', async () => {
        await expect(verify('POST', '/identities', headers, { provider, fetcher })).rejects.toMatchObject({
          statusCode: 401
        })
      })
    })

    describe('and the request uses the legacy payload with declared canonical keys', () => {
      beforeEach(() => {
        chain = Authenticator.signPayload(contractIdentity, payload.toLowerCase())
        headers = createAuthChainHeaders(chain, timestamp, metadata)
      })

      it('should retain the guarded legacy fallback with provider validation', async () => {
        await expect(
          verify('POST', '/identities', headers, { provider, fetcher, canonicalMetadataKeys: ['intent'] })
        ).resolves.toMatchObject({ auth: ownerAddress, authMetadata: metadata })
        expect(fetchMock).not.toHaveBeenCalled()
      })

      describe('and a declared metadata key is recased', () => {
        beforeEach(() => {
          headers[AUTH_METADATA_HEADER] = JSON.stringify({ Intent: 'ContractLogin' })
        })

        it('should reject the metadata before accepting the legacy payload', async () => {
          await expect(
            verify('POST', '/identities', headers, { provider, canonicalMetadataKeys: ['intent'] })
          ).rejects.toMatchObject({ statusCode: 400 })
        })
      })
    })

    describe('and the request timestamp has expired', () => {
      beforeEach(() => {
        headers[AUTH_TIMESTAMP_HEADER] = String(timestamp - 120_000)
      })

      it('should reject the request before calling the provider', async () => {
        await expect(verify('POST', '/identities', headers, { provider })).rejects.toMatchObject({ statusCode: 401 })
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })

    describe('and the metadata validator forbids the signer', () => {
      beforeEach(() => {
        headers[AUTH_METADATA_HEADER] = JSON.stringify({ signer: 'decentraland-kernel-scene' })
      })

      it('should reject the request before calling the provider', async () => {
        await expect(
          verify('POST', '/identities', headers, {
            provider,
            metadataValidator: rejectIfSigner('decentraland-kernel-scene')
          })
        ).rejects.toMatchObject({ statusCode: 400 })
        expect(sendAsync).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the contract rejects the signature', () => {
    beforeEach(() => {
      sendAsync.mockImplementation((request, callback) => {
        if (request.method === 'eth_getBlockByNumber') {
          callback(null, {
            id: request.id,
            jsonrpc: '2.0',
            result: {
              number: request.params?.[0] === '0x1' ? '0x1' : '0x64',
              timestamp:
                '0x' + (Math.floor(timestamp / 1000) - (request.params?.[0] === '0x1' ? 1000 : 1)).toString(16),
              transactions: []
            }
          })
          return
        }
        callback(null, {
          id: request.id,
          jsonrpc: '2.0',
          result: request.method === 'eth_blockNumber' ? '0x64' : '0x' + '0'.repeat(64)
        })
      })
    })

    it('should fail closed without falling back to Catalyst', async () => {
      await expect(verify('POST', '/identities', headers, { provider, fetcher })).rejects.toMatchObject({
        statusCode: 401
      })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(sendAsync.mock.calls.filter(([request]) => request.method === 'eth_call')).toHaveLength(4)
    })
  })

  describe('and the provider fails', () => {
    beforeEach(() => {
      sendAsync.mockImplementation((_request, callback) => callback(new Error('RPC request timed out')))
    })

    it('should return service unavailable without retrying the legacy payload', async () => {
      await expect(
        verify('POST', '/identities', headers, { provider, fetcher, canonicalMetadataKeys: ['intent'] })
      ).rejects.toMatchObject({ statusCode: 503, message: 'Signature verification unavailable' })
      expect(fetchMock).not.toHaveBeenCalled()
      expect(sendAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe('and a custom provider exposes credentials in its error', () => {
    let context: Parameters<ReturnType<typeof wellKnownComponents>>[0]
    let next: jest.Mock
    let response: Awaited<ReturnType<ReturnType<typeof wellKnownComponents>>>

    beforeEach(() => {
      sendAsync.mockImplementation((_request, callback) =>
        callback(new Error('Cannot connect to https://rpc-user:secret-rpc-password@example.invalid'))
      )
      context = {
        request: new Request('http://localhost/identities', { method: 'POST', headers }),
        url: new URL('http://localhost/identities')
      } as typeof context
      next = jest.fn()
    })

    it('should reject the request without disclosing credentials in the default HTTP response', async () => {
      response = await wellKnownComponents({ provider })(context, next)

      expect(response).toMatchObject({ status: 503, body: { message: 'Internal error' } })
      expect(JSON.stringify(response)).not.toMatch(/rpc-user|secret-rpc-password|example\.invalid/)
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('and the provider never answers', () => {
    let outcome: Promise<void>

    beforeEach(() => {
      jest.useFakeTimers()
      outcome = expect(
        verify('POST', '/identities', headers, { provider, canonicalMetadataKeys: ['intent'] })
      ).rejects.toMatchObject({ statusCode: 503, message: 'Signature verification unavailable' })
    })

    it('should report service unavailable after the deadline without starting a legacy retry', async () => {
      await jest.advanceTimersByTimeAsync(15_000)
      await outcome

      expect(sendAsync).toHaveBeenCalledTimes(1)
    })
  })

  describe.each(['aabb', ownerAddress.slice(2), '0x' + 'g'.repeat(40)])(
    'and the signer address is malformed (%s)',
    (signerAddress) => {
      beforeEach(() => {
        chain[0] = { ...chain[0], payload: signerAddress }
        headers = createAuthChainHeaders(chain, timestamp, metadata)
      })

      it('should reject the signer without issuing an RPC request', async () => {
        await expect(verify('POST', '/identities', headers, { provider })).rejects.toMatchObject({ statusCode: 401 })
        expect(sendAsync).not.toHaveBeenCalled()
      })
    }
  )

  describe('and the contract reverts during signature validation', () => {
    beforeEach(() => {
      sendAsync.mockImplementation((request, callback) => {
        if (request.method === 'eth_getBlockByNumber') {
          callback(null, {
            id: request.id,
            jsonrpc: '2.0',
            result: {
              number: request.params?.[0] === '0x1' ? '0x1' : '0x64',
              timestamp:
                '0x' + (Math.floor(timestamp / 1000) - (request.params?.[0] === '0x1' ? 1000 : 1)).toString(16),
              transactions: []
            }
          })
          return
        }
        if (request.method === 'eth_blockNumber') {
          callback(null, { id: request.id, jsonrpc: '2.0', result: '0x64' })
          return
        }
        callback(null, { id: request.id, jsonrpc: '2.0', error: { code: 3, message: 'execution reverted' } })
      })
    })

    it('should treat the revert as an invalid signature rather than a service outage', async () => {
      await expect(verify('POST', '/identities', headers, { provider })).rejects.toMatchObject({ statusCode: 401 })
    })
  })

  describe('and every signature comes from an EOA', () => {
    beforeEach(() => {
      chain = Authenticator.signPayload(identity, payload)
      headers = createAuthChainHeaders(chain, timestamp, metadata)
    })

    it('should verify offline without invoking either provider or Catalyst', async () => {
      await expect(verify('POST', '/identities', headers, { provider, fetcher })).resolves.toMatchObject({
        auth: ownerAddress
      })
      expect(sendAsync).not.toHaveBeenCalled()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    describe('and the ephemeral delegation has expired', () => {
      beforeEach(() => {
        chain[1] = {
          ...chain[1],
          payload: chain[1].payload.replace('3021-10-16T22:32:29.626Z', '2000-01-01T00:00:00.000Z')
        }
        headers = createAuthChainHeaders(chain, timestamp, metadata)
      })

      it('should retain the expiry diagnosis used by clients to renew their identity', async () => {
        await expect(verify('POST', '/identities', headers, { provider, fetcher })).rejects.toMatchObject({
          statusCode: 401,
          message: expect.stringMatching(/^Invalid signature: .*Ephemeral key expired/)
        })
        expect(sendAsync).not.toHaveBeenCalled()
        expect(fetchMock).not.toHaveBeenCalled()
      })
    })
  })

  describe('and the provider option is omitted', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValueOnce(Response.json({ valid: true, ownerAddress }))
    })

    it('should preserve the default Catalyst verification path', async () => {
      await expect(verify('POST', '/identities', headers, { fetcher })).resolves.toMatchObject({ auth: ownerAddress })
      expect(fetchMock).toHaveBeenCalledWith(
        'https://peer.decentraland.org/lambdas/crypto/validate-signature',
        expect.objectContaining({ body: JSON.stringify({ authChain: chain, timestamp: payload }) })
      )
      expect(sendAsync).not.toHaveBeenCalled()
    })
  })
})
