import type { IHttpServerComponent } from '@dcl/core-commons'
import RequestError from '../../src/errors'
import { AUTH_CHAIN_HEADER_PREFIX, AUTH_TIMESTAMP_HEADER, wellKnownComponents } from '../../src/index'
import verify from '../../src/verify'
import type { DecentralandSignatureContext } from '../../src/types'

jest.mock('../../src/verify', () => ({
  __esModule: true,
  default: jest.fn()
}))

const mockVerify = verify as unknown as jest.Mock

const signatureData = { auth: '0xabc', authMetadata: { hello: 'world' } }

beforeEach(() => {
  mockVerify.mockReset()
})

describe('wellKnownComponents adapter', () => {
  type Ctx = IHttpServerComponent.DefaultContext<
    IHttpServerComponent.PathAwareContext<DecentralandSignatureContext, string>
  >

  let ctx: Ctx
  let next: jest.Mock

  beforeEach(() => {
    // Native (undici) Headers — as @dcl/http-server v2 provides — rather than a node-fetch `.raw()` stub.
    ctx = {
      request: { method: 'GET', headers: new Headers({ 'x-identity-auth-chain-0': 'link-0' }) },
      url: { pathname: '/bar' }
    } as unknown as Ctx
    next = jest.fn().mockResolvedValue({ status: 200, body: 'ok' })
  })

  describe('when verify resolves', () => {
    it('should set ctx.verification and pass through to next', async () => {
      mockVerify.mockResolvedValueOnce(signatureData)

      const result = await wellKnownComponents()(ctx, next)

      expect((ctx as unknown as Record<string, unknown>).verification).toEqual(signatureData)
      expect(next).toHaveBeenCalled()
      expect(result).toEqual({ status: 200, body: 'ok' })
    })

    it('should pass verify a plain header object built from the native Headers', async () => {
      mockVerify.mockResolvedValueOnce(signatureData)

      await wellKnownComponents()(ctx, next)

      expect(mockVerify).toHaveBeenCalledWith('GET', '/bar', { 'x-identity-auth-chain-0': 'link-0' }, expect.anything())
    })

    it('should pass verify only the signature-related headers and omit unrelated ones', async () => {
      mockVerify.mockResolvedValueOnce(signatureData)
      ctx = {
        request: {
          method: 'GET',
          headers: new Headers({
            [`${AUTH_CHAIN_HEADER_PREFIX}0`]: 'link-0',
            [AUTH_TIMESTAMP_HEADER]: '123',
            cookie: 'session=secret',
            'user-agent': 'jest'
          })
        },
        url: { pathname: '/bar' }
      } as unknown as Ctx

      await wellKnownComponents()(ctx, next)

      expect(mockVerify).toHaveBeenCalledWith(
        'GET',
        '/bar',
        { [`${AUTH_CHAIN_HEADER_PREFIX}0`]: 'link-0', [AUTH_TIMESTAMP_HEADER]: '123' },
        expect.anything()
      )
    })
  })

  describe('when verify rejects', () => {
    describe('and the middleware is required', () => {
      it('should return an error response without calling next', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        const result = await wellKnownComponents()(ctx, next)

        expect(result).toEqual({ status: 401, body: { ok: false, message: 'nope' } })
        expect(next).not.toHaveBeenCalled()
      })
    })

    describe('and the middleware is optional', () => {
      it('should pass through to next without setting ctx.verification', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        const result = await wellKnownComponents({ optional: true })(ctx, next)

        expect((ctx as unknown as Record<string, unknown>).verification).toBeUndefined()
        expect(next).toHaveBeenCalled()
        expect(result).toEqual({ status: 200, body: 'ok' })
      })
    })

    describe('and a custom onError formatter is provided', () => {
      it('should delegate the response body to the formatter', async () => {
        const onError = jest.fn().mockReturnValue({ custom: 'wkc-body' })
        mockVerify.mockRejectedValueOnce(new RequestError('boom', 400))

        const result = await wellKnownComponents({ onError })(ctx, next)

        expect(onError).toHaveBeenCalledWith(expect.any(RequestError))
        expect(result).toEqual({ status: 400, body: { custom: 'wkc-body' } })
      })
    })

    describe('and the error has no statusCode', () => {
      it('should return status 500', async () => {
        mockVerify.mockRejectedValueOnce(new Error('opaque'))

        const result = await wellKnownComponents()(ctx, next)

        expect(result).toEqual(expect.objectContaining({ status: 500 }))
      })

      it('should sanitize the response body to hide internal detail', async () => {
        mockVerify.mockRejectedValueOnce(new Error('opaque internal detail'))

        const result = await wellKnownComponents()(ctx, next)

        expect(result).toEqual({ status: 500, body: { ok: false, message: 'Internal error' } })
      })
    })

    describe('and the error statusCode is 0', () => {
      it('should fall back to status 500 rather than propagate an invalid code', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('weird', 0))

        const result = await wellKnownComponents()(ctx, next)

        expect(result).toEqual(expect.objectContaining({ status: 500 }))
      })
    })

    describe('and the error statusCode is out of HTTP range', () => {
      it('should fall back to status 500', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('weird', 999))

        const result = await wellKnownComponents()(ctx, next)

        expect(result).toEqual(expect.objectContaining({ status: 500 }))
      })
    })

    describe('and the error is a 5xx RequestError', () => {
      it('should sanitize the default response body', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('catalyst at secret.internal:5000 is down', 503))

        const result = await wellKnownComponents()(ctx, next)

        expect(result).toEqual({ status: 503, body: { ok: false, message: 'Internal error' } })
      })
    })
  })
})
