import type { IFetchComponent } from '@dcl/core-commons'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import RequestError from '../../src/errors'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DEFAULT_EXPIRATION
} from '../../src/types'
import verifyAuthChainHeaders, { isEIP1654AuthChain, verifyEIP1654Sign, verifyPersonalSign } from '../../src/verify'

const identity: AuthIdentity = {
  ephemeralIdentity: {
    address: '0x84452bbFA4ca14B7828e2F3BBd106A2bD495CD34',
    publicKey:
      '0x0420c548d960b06dac035d1daf826472eded46b8b9d123294f1199c56fa235c89f2515158b1e3be0874bfb15b42d1551db8c276787a654d0b8d7b4d4356e70fe42',
    privateKey: '0xbc453a92d9baeb3d10294cbc1d48ef6738f718fd31b4eb8085efe7b311299399'
  },
  expiration: new Date('3021-10-16T22:32:29.626Z'),
  authChain: [
    {
      type: AuthLinkType.SIGNER,
      payload: '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5',
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload: `Decentraland Login\nEphemeral address: 0x84452bbFA4ca14B7828e2F3BBd106A2bD495CD34\nExpiration: 3021-10-16T22:32:29.626Z`,
      signature:
        '0x39dd4ddf131ad2435d56c81c994c4417daef5cf5998258027ef8a1401470876a1365a6b79810dc0c4a2e9352befb63a9e4701d67b38007d83ffc4cd2b7a38ad51b'
    }
  ]
}

const authChainEIP1654: AuthChain = [
  { type: AuthLinkType.SIGNER, payload: '', signature: '' },
  { type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL, payload: '', signature: '' },
  { type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, payload: '', signature: '' }
]

describe('isEIP1654AuthChain', () => {
  describe('when the auth chain is EIP-1654', () => {
    it('should return true', () => {
      expect(isEIP1654AuthChain(authChainEIP1654)).toBe(true)
    })
  })

  describe('when the auth chain is a personal signature chain', () => {
    it('should return false', () => {
      expect(isEIP1654AuthChain(identity.authChain)).toBe(false)
    })
  })

  describe('when the auth chain is empty', () => {
    it('should return false', () => {
      expect(isEIP1654AuthChain([])).toBe(false)
    })
  })
})

describe('verifyPersonalSign', () => {
  describe('when the signature is valid', () => {
    it('should return the signer owner address in lowercase', async () => {
      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(verifyPersonalSign(chain, payload)).resolves.toBe(identity.authChain[0].payload.toLowerCase())
    })
  })

  describe('when the signature is invalid', () => {
    it('should reject with an Invalid signature error', async () => {
      await expect(verifyPersonalSign([], '0123456789')).rejects.toThrow('Invalid signature')
    })
  })
})

describe('verifyEIP1654Sign', () => {
  let fetcher: IFetchComponent

  beforeEach(() => {
    fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
  })

  describe('when the catalyst confirms the signature', () => {
    it('should resolve with the signer address in lowercase', async () => {
      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      const ownerAddress = identity.authChain[0].payload.toLowerCase()
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true, ownerAddress })
      })

      await expect(verifyEIP1654Sign(chain, payload, { fetcher })).resolves.toBe(ownerAddress)
    })
  })

  describe('when a custom catalyst URL is provided', () => {
    it('should POST the auth chain and timestamp as JSON to the catalyst host', async () => {
      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      const ownerAddress = identity.authChain[0].payload.toLowerCase()
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true, ownerAddress })
      })

      await verifyEIP1654Sign(chain, payload, { catalyst: 'https://peer.decentraland.zone', fetcher })

      expect(fetcher.fetch).toHaveBeenCalledWith(
        'https://peer.decentraland.zone/lambdas/crypto/validate-signature',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'content-type': 'application/json',
            accept: 'application/json'
          })
        })
      )
      const init = (fetcher.fetch as jest.Mock).mock.calls[0][1]
      expect(JSON.parse(init.body)).toEqual({ authChain: chain, timestamp: payload })
    })
  })

  describe('when the catalyst URL preserves a non-default port and scheme', () => {
    it('should call the same scheme and port', async () => {
      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      const ownerAddress = identity.authChain[0].payload.toLowerCase()
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true, ownerAddress })
      })

      await verifyEIP1654Sign(chain, payload, { catalyst: 'http://localhost:5000', fetcher })

      expect(fetcher.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/lambdas/crypto/validate-signature',
        expect.anything()
      )
    })
  })

  describe('when no fetcher is provided', () => {
    let originalFetch: typeof fetch
    beforeEach(() => {
      originalFetch = global.fetch
      global.fetch = jest.fn() as unknown as typeof fetch
    })
    afterEach(() => {
      global.fetch = originalFetch
    })

    it('should use the global fetch', async () => {
      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      const ownerAddress = identity.authChain[0].payload.toLowerCase()
      ;(global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true, ownerAddress })
      })

      await expect(verifyEIP1654Sign(chain, payload)).resolves.toBe(ownerAddress)
      expect(global.fetch).toHaveBeenCalled()
    })
  })

  describe('when the catalyst reports the signature as invalid', () => {
    it('should reject with an Invalid signature error', async () => {
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: false, ownerAddress: '0x0' })
      })

      await expect(verifyEIP1654Sign([], '0123456789', { fetcher })).rejects.toThrow('Invalid signature')
    })
  })

  describe('when the catalyst is unreachable', () => {
    it('should reject with an Error connecting to catalyst error', async () => {
      ;(fetcher.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'))

      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(
        verifyEIP1654Sign(chain, payload, { catalyst: 'https://no-peer.decentraland.zone', fetcher })
      ).rejects.toThrow('Error connecting to catalyst')
    })
  })

  describe('when the catalyst returns a non-2xx HTTP status', () => {
    it('should reject with a 503 without parsing the body', async () => {
      const textSpy = jest.fn().mockResolvedValue(JSON.stringify({ valid: true, ownerAddress: '0x0' }))
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: textSpy
      })

      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(verifyEIP1654Sign(chain, payload, { fetcher })).rejects.toThrow(/returned HTTP 502/)
      expect(textSpy).not.toHaveBeenCalled()
    })
  })

  describe('when the catalyst responds with invalid JSON', () => {
    it('should reject with an Invalid response from catalyst error', async () => {
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'not-json'
      })

      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(verifyEIP1654Sign(chain, payload, { fetcher })).rejects.toThrow('Invalid response from catalyst')
    })
  })

  describe('when the catalyst responds with null', () => {
    it('should reject with an Invalid response from catalyst error', async () => {
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => 'null'
      })

      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(verifyEIP1654Sign(chain, payload, { fetcher })).rejects.toThrow('Invalid response from catalyst')
    })
  })

  describe('when the catalyst responds with a non-object JSON value', () => {
    it('should reject with an Invalid response from catalyst error', async () => {
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => '42'
      })

      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(verifyEIP1654Sign(chain, payload, { fetcher })).rejects.toThrow('Invalid response from catalyst')
    })
  })

  describe('when the catalyst response is missing expected fields', () => {
    it('should reject with an Invalid response from catalyst error', async () => {
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true })
      })

      const payload = '0123456789'
      const chain = Authenticator.signPayload(identity, payload)
      await expect(verifyEIP1654Sign(chain, payload, { fetcher })).rejects.toThrow('Invalid response from catalyst')
    })
  })
})

describe('verifyAuthChainHeaders', () => {
  let fetcher: IFetchComponent

  beforeEach(() => {
    fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
  })

  describe('when the headers carry a valid personal signature', () => {
    it('should return the auth and metadata', async () => {
      const timestamp = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, metadata)

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).resolves.toEqual({
        auth: identity.authChain[0].payload.toLowerCase(),
        authMetadata: {}
      })
    })
  })

  describe('when there is no auth chain in the headers', () => {
    it('should reject with an Invalid Auth Chain error', async () => {
      await expect(verifyAuthChainHeaders('', '', {}, { fetcher })).rejects.toThrow('Invalid Auth Chain')
    })
  })

  describe('when one of the auth chain headers is malformed', () => {
    it('should reject with an Invalid chain format error', async () => {
      const timestamp = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, metadata)
      headers[AUTH_CHAIN_HEADER_PREFIX + '1'] = '{'

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).rejects.toThrow('Invalid chain format:')
    })
  })

  describe('when the timestamp header is not a number', () => {
    it('should reject with an Invalid chain timestamp error', async () => {
      const timestamp = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, metadata)
      headers[AUTH_TIMESTAMP_HEADER] = 'abc'

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).rejects.toThrow(
        'Invalid chain timestamp:'
      )
    })
  })

  describe('when the signature is expired', () => {
    it('should reject with an Expired signature error', async () => {
      const timestamp = 0
      const now = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, metadata)
      jest.spyOn(Date, 'now').mockReturnValue(now)

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).rejects.toThrow(
        `Expired signature: signature timestamp: ${timestamp}, timestamp expiration: ${
          timestamp + DEFAULT_EXPIRATION
        }, local timestamp: ${now}`
      )
    })
  })

  describe('when the timestamp header differs from the one that was signed', () => {
    it('should reject with an Invalid signature error', async () => {
      const timestamp = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp + 1, metadata)

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).rejects.toThrow('Invalid signature:')
    })
  })

  describe('when the metadata header is malformed', () => {
    it('should reject with an Invalid chain metadata error', async () => {
      const timestamp = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, metadata)
      headers[AUTH_METADATA_HEADER] = '{'

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).rejects.toThrow(
        'Invalid chain metadata:'
      )
    })
  })

  describe('when the metadata header is an explicit null', () => {
    it('should resolve with the auth and an empty metadata object', async () => {
      const timestamp = Date.now()
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(null)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, null as unknown as Record<string, unknown>)

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).resolves.toEqual({
        auth: identity.authChain[0].payload.toLowerCase(),
        authMetadata: {}
      })
    })
  })

  describe('when the metadata header differs from the one that was signed', () => {
    it('should reject with an Invalid signature error', async () => {
      const timestamp = Date.now()
      const metadata = {}
      const method = 'get'
      const path = '/path/to/resource'
      const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
      const chain = Authenticator.signPayload(identity, payload)
      const headers = createAuthChainHeaders(chain, timestamp, { extra: 'data' })

      await expect(verifyAuthChainHeaders(method, path, headers, { fetcher })).rejects.toThrow('Invalid signature:')
    })
  })

  describe('when a metadataValidator is provided', () => {
    describe('and it returns true', () => {
      it('should resolve with the auth and metadata', async () => {
        const timestamp = Date.now()
        const metadata = { signer: 'a signer' }
        const method = 'get'
        const path = '/path/to/resource'
        const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
        const chain = Authenticator.signPayload(identity, payload)
        const headers = createAuthChainHeaders(chain, timestamp, metadata)

        await expect(
          verifyAuthChainHeaders(method, path, headers, { fetcher, metadataValidator: () => true })
        ).resolves.toEqual({
          auth: identity.authChain[0].payload.toLowerCase(),
          authMetadata: metadata
        })
      })
    })

    describe('and it returns false', () => {
      it('should reject with an Invalid metadata content error', async () => {
        const timestamp = Date.now()
        const metadata = { signer: 'a signer' }
        const method = 'get'
        const path = '/path/to/resource'
        const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
        const chain = Authenticator.signPayload(identity, payload)
        const headers = createAuthChainHeaders(chain, timestamp, metadata)

        await expect(
          verifyAuthChainHeaders(method, path, headers, { fetcher, metadataValidator: () => false })
        ).rejects.toThrow(`Invalid metadata content: ${JSON.stringify(metadata)}`)
      })
    })

    describe('and it throws', () => {
      it('should propagate the thrown error', async () => {
        const timestamp = Date.now()
        const metadata = { signer: 'a signer' }
        const method = 'get'
        const path = '/path/to/resource'
        const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
        const chain = Authenticator.signPayload(identity, payload)
        const headers = createAuthChainHeaders(chain, timestamp, metadata)
        const thrown = new RequestError('a custom error', 400)

        await expect(
          verifyAuthChainHeaders(method, path, headers, {
            fetcher,
            metadataValidator: () => {
              throw thrown
            }
          })
        ).rejects.toThrow('a custom error')
      })

      it('should not invoke the metadataValidator when the signature is already expired', async () => {
        const timestamp = 0
        const metadata = { signer: 'a signer' }
        const method = 'get'
        const path = '/path/to/resource'
        const payload = [method, path, timestamp, JSON.stringify(metadata)].join(':').toLowerCase()
        const chain = Authenticator.signPayload(identity, payload)
        const headers = createAuthChainHeaders(chain, timestamp, metadata)
        const metadataValidator = jest.fn().mockReturnValue(true)

        await expect(verifyAuthChainHeaders(method, path, headers, { fetcher, metadataValidator })).rejects.toThrow(
          'Expired signature'
        )

        expect(metadataValidator).not.toHaveBeenCalled()
      })
    })
  })

  describe('when a custom maxChainLength option is provided', () => {
    it('should throw when the chain exceeds the custom cap', async () => {
      const fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
      const headers: Record<string, string> = {}
      for (let i = 0; i < 5; i++) {
        headers[AUTH_CHAIN_HEADER_PREFIX + i] = '{"type":"SIGNER","payload":"0x1","signature":""}'
      }
      await expect(verifyAuthChainHeaders('get', '/p', headers, { fetcher, maxChainLength: 3 })).rejects.toThrow(
        'Auth chain exceeds maximum length of 3'
      )
    })
  })
})
