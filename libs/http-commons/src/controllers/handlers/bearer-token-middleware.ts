import { createHash, timingSafeEqual } from 'crypto'
import type { IHttpServerComponent } from '@dcl/core-commons'
import { NotAuthorizedError } from '../../errors'

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

export function bearerTokenMiddleware(
  authSecret: string
): IHttpServerComponent.IRequestHandler<Record<string, unknown>> {
  if (!authSecret) {
    throw new Error('Bearer token middleware requires a secret')
  }

  // Hashing the secret to a fixed-length digest means timingSafeEqual always compares
  // equal-length buffers, so the comparison never leaks the secret's length via timing.
  const secretHash = sha256(authSecret)

  return async function (
    ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    const header = ctx.request.headers.get('authorization')
    if (!header) {
      throw new NotAuthorizedError('Authorization header is missing')
    }

    const [type, value] = header.split(' ')
    // Auth schemes are case-insensitive per RFC 7235.
    const valueHash = sha256(value ?? '')
    if (type?.toLowerCase() !== 'bearer' || !timingSafeEqual(valueHash, secretHash)) {
      throw new NotAuthorizedError('Invalid authorization header')
    }

    return await next()
  }
}
