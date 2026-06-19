import type { IHttpServerComponent } from '@dcl/core-commons'
import createAuthChainHeaders from './createAuthChainHeaders'
import RequestError from './errors'
import { DecentralandStrategy } from './strategy'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DEFAULT_ERROR_FORMAT,
  DecentralandSignatureContext,
  DecentralandSignatureData,
  DecentralandSignatureRequiredContext,
  Options,
  VerifyAuthChainHeadersOptions
} from './types'
import verify from './verify'
import type * as e from 'express'
import type * as k from 'koa'

export {
  Options,
  VerifyAuthChainHeadersOptions,
  DecentralandSignatureData,
  DecentralandSignatureContext,
  DecentralandSignatureRequiredContext,
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_TIMESTAMP_HEADER,
  AUTH_METADATA_HEADER,
  DecentralandStrategy,
  RequestError,
  createAuthChainHeaders,
  verify
}

function errorToResponse(err: unknown, options: Pick<Options, 'onError'>): { status: number; body: unknown } {
  const errorWithStatus = err as { statusCode?: unknown; status?: unknown }
  const raw = errorWithStatus?.statusCode ?? errorWithStatus?.status
  const status = typeof raw === 'number' && Number.isInteger(raw) && raw >= 100 && raw < 600 ? raw : 500
  const onError = options.onError ?? DEFAULT_ERROR_FORMAT
  const asError = err instanceof Error ? err : new Error(String(err))
  return { status, body: onError(asError) }
}

/** Express middleware */
export function express(
  options: Options = {}
): (req: e.Request, res: e.Response, next: e.NextFunction) => Promise<void> {
  return async (req: e.Request, res: e.Response, next: e.NextFunction) => {
    try {
      const data = await verify(req.method, req.baseUrl + req.path, req.headers, options)
      Object.assign(req, data)
      next()
    } catch (err) {
      if (!options.optional) {
        const { status, body } = errorToResponse(err, options)
        res.status(status).send(body)
      } else {
        next()
      }
    }
  }
}

/** Koa middleware */
export function koa(options: Options = {}): k.Middleware {
  return async (ctx, next) => {
    try {
      const data = await verify(ctx.method, ctx.path, ctx.headers, options)
      Object.assign(ctx, data)
    } catch (err) {
      if (!options.optional) {
        const { status, body } = errorToResponse(err, options)
        ctx.status = status
        ctx.body = body
        return
      }
    }

    return next()
  }
}

/** Passport strategy */
export function passport(defaultOptions: Options = {}): DecentralandStrategy {
  return new DecentralandStrategy(defaultOptions)
}

/** Well-Known Components */
export function wellKnownComponents<P extends Record<string, unknown> = Record<string, unknown>>(
  options: Options<P> = {}
): IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext<P>, string>
> {
  return async (ctx, next) => {
    try {
      // Build a plain header map for `verify()`. The native (undici) `Headers` used by
      // @dcl/http-server v2 has no node-fetch-specific `.raw()`; `.entries()` works on both, and
      // `verify()` normalizes each value via `firstOf`, so single-valued auth headers are unaffected.
      const headers = Object.fromEntries(ctx.request.headers.entries())
      ctx.verification = await verify<P>(ctx.request.method, ctx.url.pathname, headers, options)
    } catch (err) {
      if (!options.optional) {
        const { status, body } = errorToResponse(err, options)
        return { status, body: body as IHttpServerComponent.ResponseBody }
      }
    }

    return next()
  }
}
