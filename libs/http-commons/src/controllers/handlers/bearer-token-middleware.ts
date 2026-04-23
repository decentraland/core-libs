import { timingSafeEqual } from 'crypto'
import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { NotAuthorizedError } from '../../errors'

export function bearerTokenMiddleware(
  authSecret: string
): IHttpServerComponent.IRequestHandler<Record<string, unknown>> {
  if (!authSecret) {
    throw new Error('Bearer token middleware requires a secret')
  }

  const secretBuffer = Buffer.from(authSecret)

  return async function (
    ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>>,
    next: () => Promise<IHttpServerComponent.IResponse>
  ): Promise<IHttpServerComponent.IResponse> {
    const header = ctx.request.headers.get('authorization')
    if (!header) {
      throw new NotAuthorizedError('Authorization header is missing')
    }

    const [type, value] = header.split(' ')
    const valueBuffer = Buffer.from(value ?? '')
    if (
      type !== 'Bearer' ||
      valueBuffer.length !== secretBuffer.length ||
      !timingSafeEqual(valueBuffer, secretBuffer)
    ) {
      throw new NotAuthorizedError('Invalid authorization header')
    }

    return await next()
  }
}
