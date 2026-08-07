import type { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError, NotAuthorizedError, NotFoundError, PayloadTooLargeError } from '../../errors'
import type { ComponentsWithLogger } from '../../types'

export async function errorHandler(
  ctx: IHttpServerComponent.DefaultContext<ComponentsWithLogger>,
  next: () => Promise<IHttpServerComponent.IResponse>
): Promise<IHttpServerComponent.IResponse> {
  try {
    return await next()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof InvalidRequestError) {
      return {
        status: 400,
        body: {
          error: 'Bad request',
          message: error.message
        }
      }
    }

    if (error instanceof PayloadTooLargeError) {
      return {
        status: 413,
        body: {
          error: 'Payload Too Large',
          message: error.message
        }
      }
    }

    if (error instanceof NotFoundError) {
      return {
        status: 404,
        body: {
          error: 'Not Found',
          message: error.message
        }
      }
    }

    if (error instanceof NotAuthorizedError) {
      return {
        status: 401,
        body: {
          error: 'Not Authorized',
          message: error.message
        }
      }
    }

    const { logs } = ctx.components
    const logger = logs.getLogger('error-handler')
    const name = error instanceof Error ? error.name : 'Error'
    const stack = error instanceof Error && error.stack ? error.stack : message
    // Log the error name and full stack trace so production 500s are diagnosable.
    // The stack is only logged server-side; it is never leaked to the client below.
    logger.error(`Error handling ${ctx.url.toString()}: ${name}: ${message}\n${stack}`)

    return {
      status: 500,
      body: {
        error: 'Internal Server Error'
      }
    }
  }
}
