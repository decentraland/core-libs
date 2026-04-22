import RequestError from '../../src/errors'
import { passport } from '../../src/index'
import { DecentralandStrategy } from '../../src/strategy'
import verify from '../../src/verify'
import type { Request } from 'express'

jest.mock('../../src/verify', () => ({
  __esModule: true,
  default: jest.fn()
}))

const mockVerify = verify as unknown as jest.Mock

const buildStrategy = (defaultOptions?: Parameters<typeof passport>[0]) => {
  const strategy = new DecentralandStrategy(defaultOptions)
  strategy.pass = jest.fn()
  strategy.fail = jest.fn()
  strategy.error = jest.fn()
  return strategy
}

const buildRequest = (): Request =>
  ({
    method: 'GET',
    baseUrl: '/api',
    path: '/user',
    headers: {}
  }) as unknown as Request

beforeEach(() => {
  mockVerify.mockReset()
})

describe('passport() factory', () => {
  it('should return a DecentralandStrategy instance with name "decentraland"', () => {
    const strategy = passport()
    expect(strategy).toBeInstanceOf(DecentralandStrategy)
    expect(strategy.name).toBe('decentraland')
  })
})

describe('DecentralandStrategy.authenticate', () => {
  describe('when verify resolves', () => {
    it('should assign auth and authMetadata on the request and call pass()', async () => {
      const strategy = buildStrategy()
      const req = buildRequest()
      mockVerify.mockResolvedValueOnce({ auth: '0xabc', authMetadata: { a: 1 } })

      await strategy.authenticate(req, {})

      expect(mockVerify).toHaveBeenCalledWith('GET', '/api/user', {}, {})
      expect((req as unknown as Record<string, unknown>).auth).toBe('0xabc')
      expect((req as unknown as Record<string, unknown>).authMetadata).toEqual({ a: 1 })
      expect(strategy.pass).toHaveBeenCalled()
      expect(strategy.fail).not.toHaveBeenCalled()
    })
  })

  describe('when authenticate is called without per-call options', () => {
    it('should not throw and should use the constructor defaults', async () => {
      const strategy = buildStrategy({ expiration: 999 })
      const req = buildRequest()
      mockVerify.mockResolvedValueOnce({ auth: '0xabc', authMetadata: {} })

      await expect(strategy.authenticate(req)).resolves.toBeUndefined()

      expect(mockVerify).toHaveBeenCalledWith('GET', '/api/user', {}, { expiration: 999 })
    })
  })

  describe('when constructor defaults and per-call options both provide a value', () => {
    it('should prefer the per-call option', async () => {
      const strategy = buildStrategy({ expiration: 999 })
      const req = buildRequest()
      mockVerify.mockResolvedValueOnce({ auth: '0xabc', authMetadata: {} })

      await strategy.authenticate(req, { expiration: 1 })

      expect(mockVerify).toHaveBeenCalledWith('GET', '/api/user', {}, { expiration: 1 })
    })
  })

  describe('when verify rejects with a RequestError', () => {
    describe('and the strategy is required', () => {
      it('should call fail() with the error message and status code', async () => {
        const strategy = buildStrategy()
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await strategy.authenticate(buildRequest(), {})

        expect(strategy.fail).toHaveBeenCalledWith('nope', 401)
        expect(strategy.pass).not.toHaveBeenCalled()
      })
    })

    describe('and the per-call options mark it as optional', () => {
      it('should call pass() instead of fail()', async () => {
        const strategy = buildStrategy()
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await strategy.authenticate(buildRequest(), { optional: true })

        expect(strategy.pass).toHaveBeenCalled()
        expect(strategy.fail).not.toHaveBeenCalled()
      })
    })

    describe('and the constructor defaults mark it as optional', () => {
      it('should call pass() even when per-call options do not repeat optional', async () => {
        const strategy = buildStrategy({ optional: true })
        mockVerify.mockRejectedValueOnce(new RequestError('nope', 401))

        await strategy.authenticate(buildRequest(), {})

        expect(strategy.pass).toHaveBeenCalled()
        expect(strategy.fail).not.toHaveBeenCalled()
      })
    })
  })

  describe('when verify rejects with a non-RequestError', () => {
    it('should call error() with the original error instead of fail()', async () => {
      const strategy = buildStrategy()
      const err = new Error('opaque')
      mockVerify.mockRejectedValueOnce(err)

      await strategy.authenticate(buildRequest(), {})

      expect(strategy.error).toHaveBeenCalledWith(err)
      expect(strategy.fail).not.toHaveBeenCalled()
      expect(strategy.pass).not.toHaveBeenCalled()
    })

    describe('and the strategy is optional', () => {
      it('should call pass() without surfacing the error', async () => {
        const strategy = buildStrategy({ optional: true })
        mockVerify.mockRejectedValueOnce(new Error('opaque'))

        await strategy.authenticate(buildRequest(), {})

        expect(strategy.pass).toHaveBeenCalled()
        expect(strategy.error).not.toHaveBeenCalled()
        expect(strategy.fail).not.toHaveBeenCalled()
      })
    })
  })
})
