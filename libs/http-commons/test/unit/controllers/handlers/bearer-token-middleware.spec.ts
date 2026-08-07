import type { IHttpServerComponent } from '@dcl/core-commons'
import { bearerTokenMiddleware } from '../../../../src'

describe('Bearer Token Middleware', () => {
  let next: () => Promise<IHttpServerComponent.IResponse>

  beforeEach(() => {
    next = jest.fn()
  })

  it('should fail to instantiate without a token', async () => {
    expect(() => bearerTokenMiddleware('')).toThrow('Bearer token middleware requires a secret')
    expect(next).not.toHaveBeenCalled()
  })

  it('should handle unauthenticated requests', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost'),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).rejects.toThrow('Authorization header is missing')
    expect(next).not.toHaveBeenCalled()
  })

  it('should handle request with wrong authentication', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost', {
        headers: {
          Authorization: 'Bearer saraza'
        }
      }),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).rejects.toThrow('Invalid authorization header')
    expect(next).not.toHaveBeenCalled()
  })

  it('should handle request with correct authentication', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost', {
        headers: {
          Authorization: 'Bearer some-token'
        }
      }),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('should handle request with a lowercase bearer scheme and correct token', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost', {
        headers: {
          Authorization: 'bearer some-token'
        }
      }),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('should handle request with a mixed-case bearer scheme and correct token', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost', {
        headers: {
          Authorization: 'BeArEr some-token'
        }
      }),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
  })

  it('should reject a request with a bearer scheme and a token of a different length', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost', {
        headers: {
          Authorization: 'Bearer a-much-longer-wrong-token'
        }
      }),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).rejects.toThrow('Invalid authorization header')
    expect(next).not.toHaveBeenCalled()
  })

  it('should handle request with invalid authentication header', async () => {
    const ctx: IHttpServerComponent.DefaultContext<Record<string, unknown>> = {
      request: new Request('http://localhost', {
        headers: {
          Authorization: 'Basic whatever'
        }
      }),
      url: new URL('http://localhost'),
      components: {}
    }

    await expect(bearerTokenMiddleware('some-token')(ctx, next)).rejects.toThrow('Invalid authorization header')
    expect(next).not.toHaveBeenCalled()
  })
})
