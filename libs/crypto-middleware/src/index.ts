import type * as e from 'express'
import type * as k from 'koa'
import { IHttpServerComponent } from '@well-known-components/interfaces'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DecentralandSignatureContext,
  DecentralandSignatureData,
  DecentralandSignatureRequiredContext,
  DEFAULT_ERROR_FORMAT,
  Options,
  VerifyAuthChainHeadersOptions
} from './types'
import { DecentralandStrategy } from './strategy'
import RequestError from './errors'
import createAuthChainHeaders from './createAuthChainHeaders'
import verify from './verify'

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

function errorToResponse(err: any, options: Pick<Options, 'onError'>): { status: number; body: any } {
  const status = err?.statusCode ?? err?.status ?? 500
  const onError = options.onError ?? DEFAULT_ERROR_FORMAT
  return { status, body: onError(err) }
}

/** Express middleware */
export function express(options: Options = {}) {
  return async (req: e.Request, res: e.Response, next: e.NextFunction) => {
    try {
      const data = await verify(req.method, req.baseUrl + req.path, req.headers, options)
      Object.assign(req, data)
      next()
    } catch (err: any) {
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
    } catch (err: any) {
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
export function passport(defaultOptions: Options = {}) {
  return new DecentralandStrategy(defaultOptions)
}

/** Well-Known Components */
export function wellKnownComponents<P extends Record<string, any> = Record<string, any>>(
  options: Options<P> = {}
): IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext<P>, string>
> {
  return async (ctx, next) => {
    try {
      ctx.verification = await verify<P>(ctx.request.method, ctx.url.pathname, ctx.request.headers.raw(), options)
    } catch (err: any) {
      if (!options.optional) {
        return errorToResponse(err, options)
      }
    }

    return next()
  }
}
