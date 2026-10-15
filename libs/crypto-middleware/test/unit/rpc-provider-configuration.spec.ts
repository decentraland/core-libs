import { MAX_TIMER_MILLISECONDS, createSignatureRpcProvider } from '../../src/rpc-provider'
import type { AuthChainProvider } from '../../src/rpc-provider'

function construct(endpoint: string, timeoutInMilliseconds?: number): { provider?: AuthChainProvider; error?: Error } {
  try {
    return { provider: createSignatureRpcProvider(endpoint, { timeoutInMilliseconds }) }
  } catch (error) {
    return { error: error as Error }
  }
}

describe('when an RPC provider is constructed with an invalid endpoint', () => {
  describe.each([
    ['an invalid URL', 'not-a-url?secret=configuration-secret'],
    ['a relative URL', '/rpc?secret=configuration-secret'],
    ['an FTP protocol', 'ftp://rpc.example/configuration-secret'],
    ['a data URL', 'data:text/plain,configuration-secret'],
    ['a username and password', 'https://user:configuration-secret@rpc.example'],
    ['only a username', 'https://configuration-secret@rpc.example'],
    ['only a password', 'https://:configuration-secret@rpc.example'],
    ['encoded credentials', 'https://user:configuration%2Dsecret@rpc.example'],
    ['a malformed credential URL', 'https://user:configuration-secret@[invalid']
  ])('and the endpoint contains %s', (_description, endpoint) => {
    let fetchSpy: jest.SpyInstance
    let error: Error | undefined

    beforeEach(() => {
      fetchSpy = jest.spyOn(globalThis, 'fetch')
      ;({ error } = construct(endpoint))
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it('should throw a generic endpoint error', () => {
      expect(error?.message).toBe('RPC URL must be an HTTP(S) URL without user information')
    })

    it('should not echo the endpoint in the error', () => {
      expect(error?.message).not.toContain('configuration')
    })

    it('should not make any network request', () => {
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})

describe('when an RPC provider is constructed with an invalid request timeout', () => {
  describe.each([
    0,
    -1,
    0.5,
    1.5,
    NaN,
    Infinity,
    -Infinity,
    2_147_483_648,
    Number.MAX_SAFE_INTEGER,
    '5000' as unknown as number
  ])('and the timeout is %p', (timeout) => {
    let error: Error | undefined

    beforeEach(() => {
      ;({ error } = construct('https://rpc.example', timeout))
    })

    it('should throw a timeout configuration error', () => {
      expect(error?.message).toBe('RPC timeout must be a positive integer that fits a Node timer')
    })
  })
})

describe('when an RPC provider is constructed with valid configuration', () => {
  describe.each([
    ['http://127.0.0.1:8545', 1],
    ['https://rpc.example/path?project=example', MAX_TIMER_MILLISECONDS],
    ['https://rpc.example/api-key', undefined]
  ])('and the endpoint is %s with timeout %s', (endpoint, timeout) => {
    let result: { provider?: AuthChainProvider; error?: Error }

    beforeEach(() => {
      result = construct(endpoint, timeout)
    })

    it('should construct the provider', () => {
      expect(result).toEqual({ provider: { sendAsync: expect.any(Function) } })
    })
  })
})

describe('when an RPC provider is constructed without options', () => {
  let provider: AuthChainProvider

  beforeEach(() => {
    provider = createSignatureRpcProvider('https://rpc.example')
  })

  it('should construct the provider with the default timeout', () => {
    expect(provider).toEqual({ sendAsync: expect.any(Function) })
  })
})
