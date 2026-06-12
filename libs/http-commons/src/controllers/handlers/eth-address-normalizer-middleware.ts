import type { IHttpServerComponent } from '@dcl/core-commons'
import { EthAddress } from '@dcl/schemas'

/**
 * Middleware that automatically converts Ethereum addresses to lowercase in URL parameters
 * This middleware detects parameters that match the Ethereum address pattern and normalizes them
 */
type ContextWithParams = IHttpServerComponent.DefaultContext<Record<string, unknown>> & {
  params?: Record<string, unknown>
}

type EthAddressNormalizerMiddleware = (
  ctx: ContextWithParams,
  next: () => Promise<IHttpServerComponent.IResponse>
) => Promise<IHttpServerComponent.IResponse>

export function ethAddressNormalizerMiddleware(): EthAddressNormalizerMiddleware {
  return async function (ctx, next) {
    if (!ctx.params || typeof ctx.params !== 'object') {
      return await next()
    }

    for (const [key, value] of Object.entries(ctx.params)) {
      if (typeof value === 'string' && EthAddress.validate(value)) {
        ctx.params[key] = value.toLowerCase()
      }
    }

    return await next()
  }
}
