import { createRpcProvider } from '../../src/rpc-provider'

describe('when an RPC provider is constructed with an invalid endpoint', () => {
  describe.each([
    ['an invalid URL', 'not-a-url?secret=configuration-secret'],
    ['a relative URL', '/rpc?secret=configuration-secret'],
    ['a non-HTTP protocol', 'ftp://rpc.example/configuration-secret'],
    ['a data URL', 'data:text/plain,configuration-secret'],
    ['a username', 'https://configuration-secret@rpc.example'],
    ['a password', 'https://:configuration-secret@rpc.example'],
    ['encoded credentials', 'https://user:configuration%2Dsecret@rpc.example'],
    ['a malformed credential URL', 'https://user:configuration-secret@[invalid']
  ])('and the endpoint contains %s', (_description, endpoint) => {
    let construct: () => void
    let fetchSpy: jest.SpyInstance

    beforeEach(() => {
      construct = () => {
        createRpcProvider(endpoint)
      }
      fetchSpy = jest.spyOn(globalThis, 'fetch')
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should reject configuration with a generic message that excludes the endpoint', () => {
      expect(construct).toThrow(new Error('RPC URL must be an HTTP(S) URL without user information'))
    })

    it('should reject configuration before any network request', () => {
      expect(construct).toThrow()
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})

describe('when an RPC provider is constructed with an invalid request timeout', () => {
  describe.each([0, -1, 0.5, NaN, Infinity, -Infinity, 2_147_483_648, Number.MAX_SAFE_INTEGER])(
    'and the timeout is %s',
    (timeout) => {
      let construct: () => void

      beforeEach(() => {
        construct = () => {
          createRpcProvider('https://rpc.example', { timeoutInMilliseconds: timeout })
        }
      })

      it('should reject configuration before the first validation', () => {
        expect(construct).toThrow(new Error('RPC timeout must be a positive integer that fits a Node timer'))
      })
    }
  )

  describe('and JavaScript supplies a string timeout', () => {
    let construct: () => void

    beforeEach(() => {
      construct = () => {
        createRpcProvider('https://rpc.example', { timeoutInMilliseconds: '5000' as unknown as number })
      }
    })

    it('should reject the nonnumeric configuration', () => {
      expect(construct).toThrow(new Error('RPC timeout must be a positive integer that fits a Node timer'))
    })
  })
})

describe('when an RPC provider is constructed with valid configuration', () => {
  describe.each([
    ['http://127.0.0.1:8545', 1],
    ['https://rpc.example/path?project=example', 2_147_483_647],
    ['https://rpc.example/api-key', undefined]
  ])('and the endpoint is %s with timeout %s', (endpoint, timeout) => {
    let construct: () => void

    beforeEach(() => {
      construct = () => {
        createRpcProvider(endpoint, { timeoutInMilliseconds: timeout })
      }
    })

    it('should construct the provider', () => {
      expect(construct).not.toThrow()
    })
  })
})
