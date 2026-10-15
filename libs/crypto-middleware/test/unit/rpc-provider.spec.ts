import { createServer } from 'http'
import { createSignatureRpcProvider, isExecutionRevert } from '../../src/rpc-provider'
import type { AuthChainProvider, JsonRpcCallback, JsonRpcRequest, JsonRpcResponse } from '../../src/rpc-provider'
import type { IncomingMessage, RequestListener, Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'

interface Outcome {
  callback: jest.Mock<void, Parameters<JsonRpcCallback>>
  error: Error | null
  response?: JsonRpcResponse
}

const SECRET = 'sk-example123'

async function listen(handler: RequestListener): Promise<Server> {
  const server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

function urlOf(server: Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

async function close(server: Server): Promise<void> {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

async function settle(provider: AuthChainProvider, payload: JsonRpcRequest): Promise<Outcome> {
  const callback = jest.fn<void, Parameters<JsonRpcCallback>>()
  const [error, response] = await new Promise<Parameters<JsonRpcCallback>>((resolve) => {
    callback.mockImplementation((...args) => resolve(args))
    provider.sendAsync(payload, callback)
  })
  // Lets a duplicate invocation surface before asserting.
  await new Promise((resolve) => setImmediate(resolve))
  return { callback, error, response }
}

describe('when a provider makes an HTTP JSON-RPC request', () => {
  let server: Server
  let provider: AuthChainProvider
  let answer: (response: ServerResponse) => void
  let requestBody: string
  let requestMethod: string
  let method: string
  let outcome: Outcome

  beforeEach(async () => {
    requestBody = ''
    method = 'eth_call'
    server = await listen((request: IncomingMessage, response: ServerResponse) => {
      requestMethod = request.method ?? ''
      request.on('data', (chunk) => {
        requestBody += chunk
      })
      request.on('end', () => answer(response))
    })
    provider = createSignatureRpcProvider(urlOf(server), { timeoutInMilliseconds: 5_000 })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await close(server)
  })

  describe('and the RPC returns a valid result', () => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ id: 99, jsonrpc: '2.0', result: '0x1626ba7e', error: null }))
      outcome = await settle(provider, { id: 7, method, params: [] })
    })

    it('should pass the result with the request id through the callback', () => {
      expect(outcome.response).toEqual({ id: 7, jsonrpc: '2.0', result: '0x1626ba7e' })
    })

    it('should invoke the callback once without an error', () => {
      expect(outcome.callback.mock.calls).toEqual([[null, outcome.response]])
    })

    it('should POST a JSON-RPC 2.0 payload', () => {
      expect({ method: requestMethod, body: JSON.parse(requestBody) }).toEqual({
        method: 'POST',
        body: { id: 7, jsonrpc: '2.0', method: 'eth_call', params: [] }
      })
    })
  })

  describe('and the RPC returns a block object', () => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ result: { number: '0x1', timestamp: '0x2' } }))
      outcome = await settle(provider, { id: 7, method: 'eth_getBlockByNumber', params: [] })
    })

    it('should preserve the block result', () => {
      expect(outcome.response).toEqual({ id: 7, jsonrpc: '2.0', result: { number: '0x1', timestamp: '0x2' } })
    })
  })

  describe('and the callback throws', () => {
    let throwingCallback: jest.Mock<void, Parameters<JsonRpcCallback>>

    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ result: '0x' }))
      await new Promise<void>((resolve) => {
        throwingCallback = jest.fn<void, Parameters<JsonRpcCallback>>(() => {
          resolve()
          throw new Error('Callback failed')
        })
        provider.sendAsync({ id: 7, method: 'eth_call' }, throwingCallback)
      })
      // Jest fails the test on an unhandled rejection, which surfaces after the microtask queue drains.
      await new Promise((resolve) => setImmediate(resolve))
    })

    it('should invoke the callback once with the result, containing its exception', () => {
      expect(throwingCallback.mock.calls).toEqual([[null, { id: 7, jsonrpc: '2.0', result: '0x' }]])
    })
  })

  describe.each([
    [502, 'Bad Gateway'],
    [500, `Internal error for ${SECRET}`],
    [429, 'Too Many Requests']
  ])('and the RPC answers with HTTP status %s', (status, body) => {
    let responseClosed: Promise<void>

    beforeEach(async () => {
      responseClosed = new Promise<void>((resolve) => {
        answer = (response) => {
          response.on('close', () => resolve())
          response.writeHead(status)
          // The body is left open so only a cancel can close the response.
          response.write(body)
        }
      })
      outcome = await settle(provider, { id: 7, method, params: [] })
    })

    it('should report only the status through the callback error', () => {
      expect(outcome.error?.message).toBe(`RPC request failed with status ${status}`)
    })

    it('should cancel the response body', async () => {
      await expect(responseClosed).resolves.toBeUndefined()
    })
  })

  describe.each([
    ['an empty body', ''],
    ['a non-JSON body', '<html>Bad Gateway</html>'],
    ['null', 'null'],
    ['an array', '[]'],
    ['a batch array', '[{"result":"0x"}]'],
    ['no result', '{}'],
    ['a null result', '{"result":null}'],
    ['a boolean result', '{"result":true}'],
    ['a numeric result', '{"result":123}'],
    ['an array result', '{"result":[1,2,3]}'],
    ['a deeply nested array', '['.repeat(20000) + ']'.repeat(20000)]
  ])('and the RPC returns %s', (_description, body) => {
    beforeEach(async () => {
      answer = (response) => response.end(body)
      outcome = await settle(provider, { id: 7, method, params: [] })
    })

    it('should reject the malformed response', () => {
      expect(outcome.error?.message).toBe('Invalid JSON-RPC response')
    })

    it('should invoke the callback once', () => {
      expect(outcome.callback).toHaveBeenCalledTimes(1)
    })
  })

  describe.each([
    ['code 3', { code: 3, message: `execution reverted: ${SECRET}`, data: '0x08c379a0' }, 3],
    ['code -32015', { code: -32015, message: 'VM execution error.' }, -32015],
    ['a geth revert message', { code: -32000, message: 'execution reverted' }, -32000],
    ['a revert message and a non-numeric code', { code: 'x', message: 'invalid opcode: INVALID' }, 3],
    ['a revert message and no code', { message: 'Reverted' }, 3]
  ])('and eth_call fails with %s', (_description, error, code) => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ jsonrpc: '2.0', id: 7, error }))
      outcome = await settle(provider, { id: 7, method: 'eth_call', params: [] })
    })

    it('should deliver a fixed execution reverted response', () => {
      expect(outcome.response).toEqual({ jsonrpc: '2.0', id: 7, error: { code, message: 'execution reverted' } })
    })

    it('should not report a callback error', () => {
      expect(outcome.error).toBeNull()
    })
  })

  describe.each([
    ['eth_call', 'an infrastructure error', { code: -32005, message: `limit exceeded for key ${SECRET}` }, -32005],
    ['eth_call', 'an internal error', { code: -32603, message: `internal error ${SECRET}` }, -32603],
    ['eth_getBlockByNumber', 'a revert-shaped error', { code: 3, message: `execution reverted ${SECRET}` }, 3],
    ['eth_getBlockByNumber', 'a node error', { code: -32000, message: `header not found ${SECRET}` }, -32000]
  ])('and %s fails with %s', (rpcMethod, _description, error, code) => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ jsonrpc: '2.0', id: 7, error }))
      outcome = await settle(provider, { id: 7, method: rpcMethod, params: [] })
    })

    it('should report only the numeric error code', () => {
      expect(outcome.error?.message).toBe(`RPC returned error code ${code}`)
    })

    it('should not deliver a response', () => {
      expect(outcome.response).toBeUndefined()
    })
  })

  describe.each([
    ['a string error', `"${SECRET}"`],
    ['a boolean error', 'false'],
    ['a fractional code', `{"code":1.5,"message":"${SECRET}"}`],
    ['a string code', `{"code":"-32000","message":"${SECRET}"}`],
    ['an unsafe integer code', `{"code":1152921504606846976,"message":"${SECRET}"}`],
    ['a malformed error object', '{"toString":1,"message":{"toString":1}}']
  ])('and eth_call fails with %s', (_description, error) => {
    beforeEach(async () => {
      answer = (response) => response.end(`{"jsonrpc":"2.0","id":7,"error":${error}}`)
      outcome = await settle(provider, { id: 7, method: 'eth_call', params: [] })
    })

    it('should report a generic error without upstream text', () => {
      expect(outcome.error?.message).toBe('RPC returned an error')
    })
  })

  describe('and the RPC answers 204 without a body', () => {
    beforeEach(async () => {
      answer = (response) => {
        response.writeHead(204)
        response.end()
      }
      outcome = await settle(provider, { id: 7, method, params: [] })
    })

    it('should reject the empty response', () => {
      expect(outcome.error?.message).toBe('Invalid JSON-RPC response')
    })
  })

  describe('and the RPC returns an eth_call result that is not one ABI word', () => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ result: '0x' + 'a'.repeat(66) }))
      outcome = await settle(provider, { id: 7, method: 'eth_call', params: [] })
    })

    it('should reject the result', () => {
      expect(outcome.error?.message).toBe('Invalid eth_call result')
    })
  })

  describe('and the request settles', () => {
    let setTimeoutSpy: jest.SpyInstance
    let clearTimeoutSpy: jest.SpyInstance
    let timer: unknown

    function requestTimer(spy: jest.SpyInstance): unknown {
      const index = spy.mock.calls.findIndex(([, delay]) => delay === 4_321)
      if (index === -1) throw new Error('The provider did not arm its request timer')
      return spy.mock.results[index].value
    }

    beforeEach(() => {
      setTimeoutSpy = jest.spyOn(global, 'setTimeout')
      clearTimeoutSpy = jest.spyOn(global, 'clearTimeout')
      provider = createSignatureRpcProvider(urlOf(server), { timeoutInMilliseconds: 4_321 })
    })

    describe('and it succeeds', () => {
      beforeEach(async () => {
        answer = (response) => response.end(JSON.stringify({ result: '0x' }))
        await settle(provider, { id: 7, method: 'eth_call', params: [] })
        timer = requestTimer(setTimeoutSpy)
      })

      it('should clear its request timer', () => {
        expect(clearTimeoutSpy).toHaveBeenCalledWith(timer)
      })
    })

    describe('and it fails', () => {
      beforeEach(async () => {
        answer = (response) => {
          response.writeHead(500)
          response.end()
        }
        await settle(provider, { id: 7, method: 'eth_call', params: [] })
        timer = requestTimer(setTimeoutSpy)
      })

      it('should clear its request timer', () => {
        expect(clearTimeoutSpy).toHaveBeenCalledWith(timer)
      })
    })
  })
})

describe('when a provider cannot connect to the RPC', () => {
  let provider: AuthChainProvider
  let url: string
  let outcome: Outcome

  beforeEach(async () => {
    const server = await listen(() => undefined)
    url = urlOf(server)
    await close(server)
    provider = createSignatureRpcProvider(`${url}/${SECRET}`, { timeoutInMilliseconds: 5_000 })
    outcome = await settle(provider, { id: 7, method: 'eth_call', params: [] })
  })

  it('should report a generic request failure', () => {
    expect(outcome.error?.message).toBe('RPC request failed')
  })

  it('should not expose the endpoint in the error', () => {
    expect(outcome.error?.message).not.toMatch(new RegExp(`127\\.0\\.0\\.1|${SECRET}`))
  })

  it('should invoke the callback once', () => {
    expect(outcome.callback).toHaveBeenCalledTimes(1)
  })
})

describe.each([307, 301])('when the RPC answers with a %s redirect', (status) => {
  let redirecting: Server
  let target: Server
  let targetRequests: jest.Mock
  let outcome: Outcome

  beforeEach(async () => {
    targetRequests = jest.fn()
    target = await listen((_request, response) => {
      targetRequests()
      response.end(JSON.stringify({ result: '0x' }))
    })
    redirecting = await listen((_request, response) => {
      response.writeHead(status, { location: `${urlOf(target)}/rpc` })
      response.end()
    })
    const provider = createSignatureRpcProvider(urlOf(redirecting), { timeoutInMilliseconds: 5_000 })
    outcome = await settle(provider, { id: 7, method: 'eth_call', params: [] })
  })

  afterEach(async () => {
    await close(redirecting)
    await close(target)
  })

  it('should report a generic request failure', () => {
    expect(outcome.error?.message).toBe('RPC request failed')
  })

  it('should not follow the redirect', () => {
    expect(targetRequests).not.toHaveBeenCalled()
  })
})

describe('when classifying JSON-RPC errors as contract execution failures', () => {
  describe.each([
    ['code 3', { code: 3, message: 'anything' }],
    ['code -32015', { code: -32015 }],
    ['geth execution reverted', { code: -32000, message: 'execution reverted' }],
    ['geth execution reverted with a reason', { code: -32000, message: 'execution reverted: ERC1271: invalid' }],
    ['Besu Reverted', { code: -32000, message: 'Reverted' }],
    ['Besu Reverted with data', { message: 'Reverted 0x08c379a0' }],
    ['Nethermind VM execution error', { code: -32015, message: 'VM execution error.' }],
    ['Nethermind VM execution error without code', { message: 'VM execution error.' }],
    ['Hardhat VM exception', { message: 'Error: VM Exception while processing transaction: revert' }],
    ['an invalid opcode', { message: 'invalid opcode: INVALID' }],
    ['a stack underflow', { message: 'stack underflow (0 <=> 1)' }],
    ['a stack overflow', { message: 'stack overflow (1025 <=> 1024)' }],
    ['an invalid jump destination', { message: 'invalid jump destination' }],
    ['write protection', { message: 'write protection' }],
    ['an uppercase message', { message: 'EXECUTION REVERTED' }]
  ])('and the error is %s', (_description, error) => {
    let result: boolean

    beforeEach(() => {
      result = isExecutionRevert(error)
    })

    it('should classify it as an execution revert', () => {
      expect(result).toBe(true)
    })
  })

  describe.each([
    ['a limit exceeded error', { code: -32005, message: 'limit exceeded' }],
    ['an out of gas error from a provider gas cap', { code: -32000, message: 'out of gas' }],
    ['a missing header', { code: -32000, message: 'header not found' }],
    ['a missing trie node', { code: -32000, message: 'missing trie node 0xabc (path )' }],
    ['an internal error', { code: -32603, message: 'internal error' }],
    ['a missing method', { code: -32601, message: 'method not found' }],
    ['an HTTP 429-like error', { code: 429, message: 'Too Many Requests' }],
    ['a rate limit error', { code: -32005, message: 'daily request count exceeded, request rate limited' }],
    ['a message containing reverted mid-string', { code: -32000, message: 'request rate limit, reverted later' }],
    ['a message with reverted as a prefix of a word', { message: 'revertedness' }],
    ['a string code 3', { code: '3', message: 'internal error' }],
    ['a non-string message', { message: ['execution reverted'] }],
    ['no code or message', {}]
  ])('and the error is %s', (_description, error) => {
    let result: boolean

    beforeEach(() => {
      result = isExecutionRevert(error)
    })

    it('should not classify it as an execution revert', () => {
      expect(result).toBe(false)
    })
  })
})
