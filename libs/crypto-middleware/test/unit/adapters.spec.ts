import type { IHttpServerComponent } from '@well-known-components/interfaces'
import RequestError from '../../src/errors'
import { express, koa, wellKnownComponents } from '../../src/index'
import verify from '../../src/verify'
import type { DecentralandSignatureContext } from '../../src/types'
import type { NextFunction, Request, Response } from 'express'
import type { Context } from 'koa'

jest.mock('../../src/verify', () => ({
  __esModule: true,
  default: jest.fn()
}))

const mockVerify = verify as unknown as jest.Mock

const signatureData = { auth: '0xabc', authMetadata: { hello: 'world' } }

beforeEach(() => {
  mockVerify.mockReset()
})

describe('express adapter', () => {
  let req: Request
  let res: Response
  let next: NextFunction

  beforeEach(() => {
    req = { method: 'GET', baseUrl: '/api', path: '/user', headers: {} } as unknown as Request
    res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    } as unknown as Response
    next = jest.fn() as unknown as NextFunction
  })

  describe('when verify resolves', () => {
    it('should assign auth and authMetadata on the request and call next without arguments', async () => {
      mockVerify.mockResolvedValueOnce(signatureData)

      await express()(req, res, next)

      expect(mockVerify).toHaveBeenCalledWith('GET', '/api/user', {}, {})
      expect((req as unknown as Record<string, unknown>).auth).toBe('0xabc')
      expect((req as unknown as Record<string, unknown>).authMetadata).toEqual({ hello: 'world' })
      expect(next).toHaveBeenCalledWith()
      expect(res.status).not.toHaveBeenCalled()
    })
  })

  describe('when verify rejects', () => {
    describe('and the middleware is required', () => {
      it('should respond with the error status and the default error format', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await express()(req, res, next)

        expect(res.status).toHaveBeenCalledWith(401)
        expect(res.send).toHaveBeenCalledWith({ ok: false, message: 'nope' })
        expect(next).not.toHaveBeenCalled()
      })
    })

    describe('and the middleware is optional', () => {
      it('should skip the response and call next without arguments', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await express({ optional: true })(req, res, next)

        expect(res.status).not.toHaveBeenCalled()
        expect(next).toHaveBeenCalledWith()
      })
    })

    describe('and a custom onError formatter is provided', () => {
      it('should delegate the response body to the formatter', async () => {
        const onError = jest.fn().mockReturnValue({ custom: 'body' })
        mockVerify.mockRejectedValueOnce(new RequestError('boom', 400))

        await express({ onError })(req, res, next)

        expect(onError).toHaveBeenCalledWith(expect.any(RequestError))
        expect(res.status).toHaveBeenCalledWith(400)
        expect(res.send).toHaveBeenCalledWith({ custom: 'body' })
      })
    })

    describe('and the error has no statusCode', () => {
      it('should respond with status 500', async () => {
        mockVerify.mockRejectedValueOnce(new Error('opaque'))

        await express()(req, res, next)

        expect(res.status).toHaveBeenCalledWith(500)
      })

      it('should sanitize the response body to hide internal detail', async () => {
        mockVerify.mockRejectedValueOnce(new Error('opaque internal detail'))

        await express()(req, res, next)

        expect(res.send).toHaveBeenCalledWith({ ok: false, message: 'Internal error' })
      })
    })

    describe('and the error statusCode is 0', () => {
      it('should fall back to status 500 rather than propagate an invalid code', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('weird', 0))

        await express()(req, res, next)

        expect(res.status).toHaveBeenCalledWith(500)
      })
    })

    describe('and the error statusCode is out of HTTP range', () => {
      it('should fall back to status 500', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('weird', 999))

        await express()(req, res, next)

        expect(res.status).toHaveBeenCalledWith(500)
      })
    })

    describe('and the error is a 5xx RequestError', () => {
      it('should sanitize the default response body', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('catalyst at secret.internal:5000 is down', 503))

        await express()(req, res, next)

        expect(res.status).toHaveBeenCalledWith(503)
        expect(res.send).toHaveBeenCalledWith({ ok: false, message: 'Internal error' })
      })
    })
  })
})

describe('koa adapter', () => {
  let ctx: Context
  let next: jest.Mock

  beforeEach(() => {
    ctx = { method: 'POST', path: '/foo', headers: {}, status: 0, body: undefined } as unknown as Context
    next = jest.fn().mockResolvedValue(undefined)
  })

  describe('when verify resolves', () => {
    it('should assign auth and authMetadata on the context and continue the chain', async () => {
      mockVerify.mockResolvedValueOnce(signatureData)

      await koa()(ctx, next)

      expect(mockVerify).toHaveBeenCalledWith('POST', '/foo', {}, {})
      expect((ctx as unknown as Record<string, unknown>).auth).toBe('0xabc')
      expect(next).toHaveBeenCalled()
    })
  })

  describe('when verify rejects', () => {
    describe('and the middleware is required', () => {
      it('should set status and body on the context and not call next', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await koa()(ctx, next)

        expect(ctx.status).toBe(401)
        expect(ctx.body).toEqual({ ok: false, message: 'nope' })
        expect(next).not.toHaveBeenCalled()
      })
    })

    describe('and the middleware is optional', () => {
      it('should not set the status and should continue the chain', async () => {
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await koa({ optional: true })(ctx, next)

        expect(ctx.status).toBe(0)
        expect(next).toHaveBeenCalled()
      })
    })

    describe('and a custom onError formatter is provided', () => {
      it('should delegate the response body to the formatter', async () => {
        const onError = jest.fn().mockReturnValue({ custom: 'koa-body' })
        mockVerify.mockRejectedValueOnce(new RequestError('boom', 400))

        await koa({ onError })(ctx, next)

        expect(onError).toHaveBeenCalledWith(expect.any(RequestError))
        expect(ctx.status).toBe(400)
        expect(ctx.body).toEqual({ custom: 'koa-body' })
      })
    })

    describe('and the error has no statusCode', () => {
      it('should set the status to 500', async () => {
        mockVerify.mockRejectedValueOnce(new Error('opaque'))

        await koa()(ctx, next)

        expect(ctx.status).toBe(500)
      })
    })
  })
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
    })
  })
})
