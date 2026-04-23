import type { AuthIdentity } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import signedHeaderFactory from '../../src/signedHeaderFactory'

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

describe('signedHeaderFactory', () => {
  let dateNowSpy: jest.SpyInstance

  beforeEach(() => {
    dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
  })

  afterEach(() => {
    dateNowSpy.mockRestore()
  })

  describe('when called with an identity and empty metadata', () => {
    it('should return headers containing the auth chain, timestamp and empty metadata', () => {
      const signedHeader = signedHeaderFactory()
      const headers = signedHeader(identity, 'GET', '/anything', {})

      expect(headers.get('x-identity-timestamp')).toBe('1700000000000')
      expect(headers.get('x-identity-metadata')).toBe('{}')
      expect(headers.get('x-identity-auth-chain-0')).toBeTruthy()
      expect(headers.get('x-identity-auth-chain-1')).toBeTruthy()
    })
  })

  describe('when called with metadata', () => {
    it('should serialize the metadata into the metadata header', () => {
      const signedHeader = signedHeaderFactory()
      const headers = signedHeader(identity, 'POST', '/anything', { foo: 'bar' })

      expect(headers.get('x-identity-metadata')).toBe('{"foo":"bar"}')
    })
  })

  describe('when a custom Headers implementation is provided', () => {
    it('should instantiate headers using the provided implementation', () => {
      const HeadersSpy = jest.fn((init?: HeadersInit) => new Headers(init))
      const signedHeader = signedHeaderFactory({ Headers: HeadersSpy as unknown as typeof Headers })
      signedHeader(identity, 'GET', '/anything', {})

      expect(HeadersSpy).toHaveBeenCalledTimes(1)
    })
  })

  describe('when an initial HeadersInit is provided', () => {
    it('should preserve the provided headers alongside the auth chain headers', () => {
      const signedHeader = signedHeaderFactory()
      const headers = signedHeader(identity, 'GET', '/anything', {}, { 'content-type': 'application/json' })

      expect(headers.get('content-type')).toBe('application/json')
      expect(headers.get('x-identity-timestamp')).toBe('1700000000000')
    })
  })

  describe('the payload passed to Authenticator.signPayload', () => {
    let signPayloadSpy: jest.SpyInstance

    beforeEach(() => {
      signPayloadSpy = jest.spyOn(Authenticator, 'signPayload')
    })

    afterEach(() => {
      signPayloadSpy.mockRestore()
    })

    describe('when called with mixed-case method, path and metadata', () => {
      it('should join them as method:path:timestamp:metadata and lowercase the result', () => {
        const signedHeader = signedHeaderFactory()
        signedHeader(identity, 'POST', '/Users/Me', { Foo: 'Bar' })

        expect(signPayloadSpy).toHaveBeenCalledTimes(1)
        const [, payload] = signPayloadSpy.mock.calls[0]
        expect(payload).toBe('post:/users/me:1700000000000:{"foo":"bar"}')
      })
    })

    describe('when called with empty metadata', () => {
      it('should sign with an empty-object JSON literal in the metadata segment', () => {
        const signedHeader = signedHeaderFactory()
        signedHeader(identity, 'GET', '/anything', {})

        const [, payload] = signPayloadSpy.mock.calls[0]
        expect(payload).toBe('get:/anything:1700000000000:{}')
      })
    })
  })

  describe('when the auth chain contains more than two links', () => {
    it('should emit one x-identity-auth-chain-* header per link', () => {
      const threeLink: AuthIdentity = {
        ...identity,
        authChain: [...identity.authChain, { ...identity.authChain[1] }]
      }
      const signedHeader = signedHeaderFactory()
      const headers = signedHeader(threeLink, 'GET', '/anything', {})

      expect(headers.get('x-identity-auth-chain-0')).toBeTruthy()
      expect(headers.get('x-identity-auth-chain-1')).toBeTruthy()
      expect(headers.get('x-identity-auth-chain-2')).toBeTruthy()
    })
  })
})
