import type { AuthIdentity } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import signedFetchFactory from '../../src/signedFetchFactory'

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

describe('signedFetchFactory', () => {
  let fetchMock: jest.MockedFunction<typeof fetch>

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue(new Response('ok')) as jest.MockedFunction<typeof fetch>
  })

  describe('when no identity is provided', () => {
    describe('and the input is a string url', () => {
      it('should delegate to fetch with the raw input and init', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch('https://service.example/api/resource', { method: 'GET' })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        expect(fetchMock).toHaveBeenCalledWith('https://service.example/api/resource', { method: 'GET' })
      })
    })

    describe('and no init is provided', () => {
      it('should delegate to fetch with only the input', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch('https://service.example/api/resource')

        expect(fetchMock).toHaveBeenCalledWith('https://service.example/api/resource', undefined)
      })
    })
  })

  describe('when an identity is provided', () => {
    describe('and the input is a string url', () => {
      it('should build a Request with signed headers and call fetch with it', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch('https://service.example/api/resource', { method: 'POST', identity })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const request = fetchMock.mock.calls[0][0] as Request
        expect(request).toBeInstanceOf(Request)
        expect(request.url).toBe('https://service.example/api/resource')
        expect(request.method).toBe('POST')
        expect(request.headers.get('x-identity-auth-chain-0')).toBeTruthy()
        expect(request.headers.get('x-identity-auth-chain-1')).toBeTruthy()
        expect(request.headers.get('x-identity-timestamp')).toBeTruthy()
        expect(request.headers.get('x-identity-metadata')).toBe('{}')
      })
    })

    describe('and the input is a URL instance', () => {
      it('should build a signed Request using the URL pathname', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch(new URL('https://service.example/api/resource'), { identity })

        const request = fetchMock.mock.calls[0][0] as Request
        expect(request.url).toBe('https://service.example/api/resource')
        expect(request.headers.get('x-identity-auth-chain-0')).toBeTruthy()
      })
    })

    describe('and metadata is provided', () => {
      it('should serialize the metadata into the x-identity-metadata header', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        const metadata = { random: 42 }
        await signedFetch('https://service.example/api/resource', { identity, metadata })

        const request = fetchMock.mock.calls[0][0] as Request
        expect(request.headers.get('x-identity-metadata')).toBe(JSON.stringify(metadata))
      })
    })

    describe('and the input is an existing Request instance', () => {
      it('should copy the auth chain headers onto the existing request', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        const original = new Request('https://service.example/api/resource', { method: 'POST' })
        await signedFetch(original, { identity })

        const request = fetchMock.mock.calls[0][0] as Request
        expect(request.method).toBe('POST')
        expect(request.url).toBe('https://service.example/api/resource')
        expect(request.headers.get('x-identity-auth-chain-0')).toBeTruthy()
      })
    })

    describe('and the init contains pre-existing headers', () => {
      it('should merge those headers with the auth chain headers', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch('https://service.example/api/resource', {
          identity,
          headers: { 'content-type': 'application/json' }
        })

        const request = fetchMock.mock.calls[0][0] as Request
        expect(request.headers.get('content-type')).toBe('application/json')
        expect(request.headers.get('x-identity-auth-chain-0')).toBeTruthy()
      })
    })

    describe('and no method is provided', () => {
      it('should default to GET for the signed payload', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch('https://service.example/api/resource', { identity })

        const request = fetchMock.mock.calls[0][0] as Request
        expect(request.method).toBe('GET')
      })
    })
  })

  describe('the payload used for signing', () => {
    let signPayloadSpy: jest.SpyInstance

    beforeEach(() => {
      signPayloadSpy = jest.spyOn(Authenticator, 'signPayload').mockReturnValue([])
    })

    afterEach(() => {
      signPayloadSpy.mockRestore()
    })

    describe('when the url contains a query string', () => {
      it('should sign the pathname only, excluding the query string and host', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch('https://service.example/api/resource?token=secret', { identity })

        const [, payload] = signPayloadSpy.mock.calls[0]
        expect(payload).toContain(':/api/resource:')
        expect(payload).not.toContain('service.example')
        expect(payload).not.toContain('token=secret')
      })
    })

    describe('when the input is a URL instance with a query string', () => {
      it('should sign the pathname only', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        await signedFetch(new URL('https://service.example/api/resource?token=secret'), { identity })

        const [, payload] = signPayloadSpy.mock.calls[0]
        expect(payload).toContain(':/api/resource:')
        expect(payload).not.toContain('token=secret')
      })
    })

    describe('when the input is an existing Request with a query string', () => {
      it('should sign the pathname only', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock })
        const request = new Request('https://service.example/api/resource?token=secret', { method: 'POST' })
        await signedFetch(request, { identity })

        const [, payload] = signPayloadSpy.mock.calls[0]
        expect(payload).toContain(':/api/resource:')
        expect(payload).not.toContain('token=secret')
      })
    })
  })

  describe('when a custom URL implementation is injected', () => {
    class WrappedURL extends URL {}

    describe('and the input is a native globalThis.URL instance', () => {
      it('should still take the URL branch via the globalThis.URL fallback', async () => {
        const signedFetch = signedFetchFactory({ fetch: fetchMock, URL: WrappedURL })
        await signedFetch(new URL('https://service.example/api/resource'), { identity })

        expect(fetchMock).toHaveBeenCalledTimes(1)
        const request = fetchMock.mock.calls[0][0] as Request
        expect(request.url).toBe('https://service.example/api/resource')
        expect(request.headers.get('x-identity-auth-chain-0')).toBeTruthy()
      })
    })
  })

  describe('when the required global implementation is missing from options and globals', () => {
    it('should throw a ReferenceError on construction', () => {
      const originalFetch = globalThis.fetch
      globalThis.fetch = undefined as unknown as typeof fetch
      try {
        expect(() => signedFetchFactory()).toThrow(ReferenceError)
      } finally {
        globalThis.fetch = originalFetch
      }
    })
  })
})
