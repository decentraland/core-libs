import type { ILoggerComponent } from '@well-known-components/interfaces'
import type { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError, NotAuthorizedError, NotFoundError, PayloadTooLargeError } from '../../../../src'
import { errorHandler } from '../../../../src/controllers'
import type { ComponentsWithLogger } from '../../../../src/types'

describe('Error Handler', () => {
  let ctx: IHttpServerComponent.DefaultContext<ComponentsWithLogger>
  let logs: ILoggerComponent
  let logger: ILoggerComponent.ILogger

  beforeEach(async () => {
    logger = {
      log: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    }
    logs = {
      getLogger: jest.fn().mockReturnValue(logger)
    }
    ctx = {
      request: new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' })
      }),
      url: new URL('http://localhost'),
      components: { logs }
    }
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should handle InvalidRequestError correctly', async () => {
    const next = async () => {
      throw new InvalidRequestError('invalid error')
    }

    await expect(errorHandler(ctx, next)).resolves.toEqual({
      body: { error: 'Bad request', message: 'invalid error' },
      status: 400
    })
  })

  it('should handle PayloadTooLargeError correctly', async () => {
    const next = async () => {
      throw new PayloadTooLargeError('payload too large error')
    }

    await expect(errorHandler(ctx, next)).resolves.toEqual({
      body: { error: 'Payload Too Large', message: 'payload too large error' },
      status: 413
    })
  })

  it('should handle NotFoundError correctly', async () => {
    const next = async () => {
      throw new NotFoundError('not found error')
    }

    await expect(errorHandler(ctx, next)).resolves.toEqual({
      body: { error: 'Not Found', message: 'not found error' },
      status: 404
    })
  })

  it('should handle NotAuthorizedError correctly', async () => {
    const next = async () => {
      throw new NotAuthorizedError('not authorized error')
    }

    await expect(errorHandler(ctx, next)).resolves.toEqual({
      body: { error: 'Not Authorized', message: 'not authorized error' },
      status: 401
    })
  })

  it('should handle unhandled errors correctly', async () => {
    const next = async () => {
      throw new Error('unknown error')
    }

    await expect(errorHandler(ctx, next)).resolves.toEqual({
      body: { error: 'Internal Server Error' },
      status: 500
    })
  })

  it('should log the error name and stack trace when handling an unhandled error', async () => {
    const error = new Error('unknown error')
    const next = async () => {
      throw error
    }

    await errorHandler(ctx, next)

    expect(logger.error).toHaveBeenCalledTimes(1)
    const loggedMessage = (logger.error as jest.Mock).mock.calls[0][0] as string
    expect(loggedMessage).toContain('Error')
    expect(loggedMessage).toContain('unknown error')
    expect(loggedMessage).toContain(error.stack as string)
  })

  it('should not leak the internal error stack in the response body', async () => {
    const error = new Error('unknown error with secret details')
    const next = async () => {
      throw error
    }

    await expect(errorHandler(ctx, next)).resolves.toEqual({
      body: { error: 'Internal Server Error' },
      status: 500
    })
  })
})
