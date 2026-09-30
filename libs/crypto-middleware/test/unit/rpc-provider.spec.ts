import { createServer } from 'http'
import { createRpcProvider } from '../../src/rpc-provider'
import type { AuthChainProvider, JsonRpcResponse } from '../../src/rpc-provider'
import type { Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'

function send(
  provider: AuthChainProvider,
  signal?: AbortSignal,
  method = 'eth_call'
): Promise<JsonRpcResponse | undefined> {
  return new Promise((resolve, reject) => {
    provider.sendAsync(
      { id: 7, method, params: [] },
      (error, response) => (error ? reject(error) : resolve(response)),
      signal
    )
  })
}

describe('when a provider makes an HTTP JSON-RPC request', () => {
  let server: Server
  let provider: AuthChainProvider
  let answer: (response: ServerResponse) => void
  let requestBody: string

  beforeEach(async () => {
    requestBody = ''
    server = createServer((request, response) => {
      request.on('data', (chunk) => {
        requestBody += chunk
      })
      request.on('end', () => answer(response))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    provider = createRpcProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      timeoutInMilliseconds: 200
    })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('and the RPC returns a valid result', () => {
    beforeEach(() => {
      answer = (response) => response.end(JSON.stringify({ id: 7, jsonrpc: '2.0', result: '0x1626ba7e', error: null }))
    })

    it('should pass the result through the callback', async () => {
      await expect(send(provider)).resolves.toEqual({ id: 7, jsonrpc: '2.0', result: '0x1626ba7e' })
    })

    it('should send a JSON-RPC 2.0 payload', async () => {
      await send(provider)
      expect(JSON.parse(requestBody)).toEqual({ id: 7, jsonrpc: '2.0', method: 'eth_call', params: [] })
    })

    it('should contain exceptions thrown by the callback', async () => {
      await new Promise<void>((resolve) => {
        provider.sendAsync({ id: 7, method: 'eth_call' }, () => {
          resolve()
          throw new Error('Callback failed')
        })
      })
      await new Promise((resolve) => setTimeout(resolve, 20))
    })
  })

  describe('and the RPC returns a block object', () => {
    beforeEach(() => {
      answer = (response) => response.end(JSON.stringify({ result: { number: '0x1', timestamp: '0x2' } }))
    })

    it('should preserve the block result', async () => {
      await expect(send(provider, undefined, 'eth_getBlockByNumber')).resolves.toEqual({
        id: 7,
        jsonrpc: '2.0',
        result: { number: '0x1', timestamp: '0x2' }
      })
    })
  })

  describe('and the RPC returns an error status', () => {
    beforeEach(() => {
      answer = (response) => {
        response.writeHead(502)
        response.end('Bad Gateway')
      }
    })

    it('should report the status through the callback error', async () => {
      await expect(send(provider)).rejects.toThrow('RPC request failed with status 502')
    })
  })

  describe('and the RPC returns an oversized error message', () => {
    beforeEach(() => {
      answer = (response) => response.end(JSON.stringify({ error: { code: -32000, message: 'x'.repeat(5000) } }))
    })

    it('should cap the JSON-RPC error message', async () => {
      await expect(send(provider)).resolves.toEqual({
        id: 7,
        jsonrpc: '2.0',
        error: { code: -32000, message: 'x'.repeat(200) }
      })
    })
  })

  describe('and the RPC returns a malformed error', () => {
    beforeEach(() => {
      answer = (response) => response.end(JSON.stringify({ error: { toString: 1, message: { toString: 1 } } }))
    })

    it('should normalize the error without invoking untrusted conversion methods', async () => {
      await expect(send(provider)).resolves.toEqual({
        id: 7,
        jsonrpc: '2.0',
        error: { code: -32603, message: 'JSON-RPC error' }
      })
    })
  })

  describe.each([
    ['null', 'null'],
    ['an array', '[]'],
    ['no result', '{}'],
    ['a numeric result', '{"result":123}'],
    ['an array result', '{"result":[1,2,3]}'],
    ['a deeply nested array', '['.repeat(20000) + ']'.repeat(20000)]
  ])('and the RPC returns %s', (_description, body) => {
    beforeEach(() => {
      answer = (response) => response.end(body)
    })

    it('should reject the malformed response', async () => {
      await expect(send(provider)).rejects.toThrow('Invalid JSON-RPC response')
    })
  })

  describe('and the RPC returns invalid JSON', () => {
    beforeEach(() => {
      answer = (response) => response.end('<html>Bad Gateway</html>')
    })

    it('should report a parsing error through the callback', async () => {
      await expect(send(provider)).rejects.toThrow('Invalid JSON-RPC response')
    })
  })

  describe('and the RPC stalls the response body', () => {
    beforeEach(() => {
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.write('{"result":')
      }
    })

    it('should time out while reading the body', async () => {
      await expect(send(provider)).rejects.toThrow('RPC request timed out')
    })
  })
})
