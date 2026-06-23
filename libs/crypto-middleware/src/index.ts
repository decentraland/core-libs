import type { IHttpServerComponent } from '@dcl/core-commons'
import createAuthChainHeaders from './createAuthChainHeaders'
import RequestError from './errors'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DEFAULT_ERROR_FORMAT,
  DEFAULT_MAX_CHAIN_LENGTH,
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
  RequestError,
  createAuthChainHeaders,
  verify
}

/**
 * Reads only the headers `verify()` consumes — the auth-chain links, the timestamp
 * and the metadata — from a native `Headers`, instead of materializing the entire
 * header set into a plain object on every request.
 */
function pickSignatureHeaders(headers: Headers, maxChainLength: number): Record<string, string | undefined> {
  const picked: Record<string, string | undefined> = {}

  const timestamp = headers.get(AUTH_TIMESTAMP_HEADER)
  if (timestamp !== null) {
    picked[AUTH_TIMESTAMP_HEADER] = timestamp
  }

  const metadata = headers.get(AUTH_METADATA_HEADER)
  if (metadata !== null) {
    picked[AUTH_METADATA_HEADER] = metadata
  }

  // Read up to and including `maxChainLength` so `extractAuthChain` can still detect
  // an over-length chain (it inspects the index at `maxChainLength`).
  for (let index = 0; index <= maxChainLength; index++) {
    const link = headers.get(AUTH_CHAIN_HEADER_PREFIX + index)
    if (link !== null) {
      picked[AUTH_CHAIN_HEADER_PREFIX + index] = link
    }
  }

  return picked
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

/** Well-Known Components */
export function wellKnownComponents<P extends Record<string, unknown> = Record<string, unknown>>(
  options: Options<P> = {}
): IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext<P>, string>
> {
  return async (ctx, next) => {
    try {
      // Pass `verify()` only the auth-related headers (chain links, timestamp, metadata)
      // read straight from the native `Headers`, rather than materializing the whole
      // header set per request. `Headers.get` is case-insensitive, so this also works
      // regardless of header casing.
      const headers = pickSignatureHeaders(ctx.request.headers, options.maxChainLength ?? DEFAULT_MAX_CHAIN_LENGTH)
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
