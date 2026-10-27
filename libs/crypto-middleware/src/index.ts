import type { IHttpServerComponent } from '@dcl/core-commons'
import { OPERATION_FORMAT, SERVICE_FORMAT } from '@dcl/crypto'
import createAuthChainHeaders from './createAuthChainHeaders'
import RequestError from './errors'
import { canonicalField, rejectIfSigner, requireCanonicalField, requireSigner } from './metadataValidators'
import { authorizeVerifiedRequest } from './scoped-authorization'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DEFAULT_ERROR_FORMAT,
  DEFAULT_MAX_CHAIN_LENGTH,
  DecentralandSignatureContext,
  DecentralandSignatureData,
  DecentralandSignatureRequiredContext,
  DecentralandSignatureRouteContext,
  Options,
  RouteOperationOptions,
  VerifyAuthChainHeadersOptions
} from './types'
import verify, { createPayload, verifyIdentity } from './verify'
import type { MetadataPredicate } from './metadataValidators'

export { createSignatureRpcProvider } from './rpc-provider'
export type { AuthChainProvider, JsonRpcRequest, JsonRpcResponse, JsonRpcCallback } from './rpc-provider'
export {
  validateAuthChainSignature,
  MAX_AUTH_CHAIN_LENGTH,
  SignatureValidationInfrastructureError
} from './signature-validation'
export type { SignatureValidationOptions } from './signature-validation'
export { isOperationGranted } from '@dcl/crypto'
export type { ScopedLoginGrant, ScopedLoginScope } from '@dcl/crypto'

export {
  Options,
  MetadataPredicate,
  VerifyAuthChainHeadersOptions,
  DecentralandSignatureData,
  DecentralandSignatureContext,
  DecentralandSignatureRequiredContext,
  DecentralandSignatureRouteContext,
  RouteOperationOptions,
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_TIMESTAMP_HEADER,
  AUTH_METADATA_HEADER,
  RequestError,
  createAuthChainHeaders,
  createPayload,
  canonicalField,
  rejectIfSigner,
  requireCanonicalField,
  requireSigner,
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

function isValidOperation(operation: unknown): operation is string {
  return typeof operation === 'string' && operation !== '*' && OPERATION_FORMAT.test(operation)
}

/**
 * Well-Known Components middleware: verifies the request's signed-fetch headers (ADR-44) and sets
 * `ctx.verification`. With `service`, it also accepts scoped logins (ADR-162) on routes that declare
 * their `operation`, so create one per route.
 *
 * @throws Error at creation when an option is malformed, or `operation`, `resource` or
 *   `maxScopedLoginLifetime` is given without what it depends on.
 */
export function wellKnownComponents<P extends Record<string, unknown> = Record<string, unknown>>(
  options: Options<P> = {}
): IHttpServerComponent.IRequestHandler<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext<P>, string>
> {
  // Fail at startup rather than as a 401 on every request.
  const { maxChainLength, maxRpcCalls, service, maxScopedLoginLifetime, operation, resource } = options
  if (service !== undefined && !SERVICE_FORMAT.test(service)) {
    throw new Error('service must be 1 to 64 lowercase letters, digits or hyphens')
  }
  if (maxScopedLoginLifetime !== undefined) {
    if (service === undefined) {
      throw new Error('maxScopedLoginLifetime needs a service')
    }
    if (!(Number.isFinite(maxScopedLoginLifetime) && maxScopedLoginLifetime > 0)) {
      throw new Error('maxScopedLoginLifetime must be a positive number of milliseconds')
    }
  }
  if (operation !== undefined) {
    if (service === undefined) {
      throw new Error('operation needs a service')
    }
    if (typeof operation !== 'function' && !isValidOperation(operation)) {
      throw new Error('operation must be 1 to 64 lowercase letters, digits or hyphens')
    }
  }
  if (resource !== undefined && operation === undefined) {
    throw new Error('resource needs an operation')
  }
  if (options.provider) {
    if (maxChainLength !== undefined && (!Number.isSafeInteger(maxChainLength) || maxChainLength < 2)) {
      throw new Error('maxChainLength must be an integer of at least 2 when a provider is set')
    }
    if (maxRpcCalls !== undefined && (!Number.isSafeInteger(maxRpcCalls) || maxRpcCalls < 1)) {
      throw new Error('maxRpcCalls must be a positive integer')
    }
  }
  return async (ctx, next) => {
    let verification: DecentralandSignatureData<P> | undefined
    try {
      // Pass `verify()` only the auth-related headers (chain links, timestamp, metadata)
      // read straight from the native `Headers`, rather than materializing the whole
      // header set per request. `Headers.get` is case-insensitive, so this also works
      // regardless of header casing.
      const headers = pickSignatureHeaders(ctx.request.headers, options.maxChainLength ?? DEFAULT_MAX_CHAIN_LENGTH)
      verification = await verifyIdentity<P>(ctx.request.method, ctx.url.pathname, headers, options)
    } catch (err) {
      if (!options.optional) {
        const { status, body } = errorToResponse(err, options)
        return { status, body: body as IHttpServerComponent.ResponseBody }
      }
    }

    // Outside the try: `optional` lets an unsigned request through, never a scoped login its route
    // doesn't grant.
    if (verification) {
      try {
        const operation = typeof options.operation === 'function' ? options.operation(ctx) : options.operation
        let resource: string | undefined
        if (options.resource) {
          resource = options.resource(ctx)
          if (resource === undefined) {
            throw new RequestError('Cannot resolve the request resource', 403, 'SCOPED_RESOURCE_REQUIRED')
          }
        }
        verification = authorizeVerifiedRequest(verification, { service: options.service, operation, resource })
      } catch (err) {
        const denied =
          err instanceof RequestError
            ? err
            : new RequestError('Cannot resolve the request operation or resource', 403, 'SCOPED_RESOLUTION_FAILED')
        const { status, body } = errorToResponse(denied, options)
        return { status, body: body as IHttpServerComponent.ResponseBody }
      }
      ctx.verification = verification
    }

    return next()
  }
}
