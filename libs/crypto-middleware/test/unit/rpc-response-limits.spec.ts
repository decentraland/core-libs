import { createServer } from 'http'
import { gzipSync } from 'zlib'
import { createSignatureRpcProvider } from '../../src/rpc-provider'
import type { AuthChainProvider, JsonRpcCallback, JsonRpcResponse } from '../../src/rpc-provider'
import type { Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'

interface Outcome {
  error: Error | null
  response?: JsonRpcResponse
}

const LIMIT = 1024 * 1024

function settle(provider: AuthChainProvider, method: string): Promise<Outcome> {
  return new Promise<Parameters<JsonRpcCallback>>((resolve) => {
    provider.sendAsync({ id: 7, method, params: [] }, (...args) => resolve(args))
  }).then(([error, response]) => ({ error, response }))
}

/** Resolves whether the promise settled before the deadline, without leaving the timer behind. */
async function within(promise: Promise<void>, milliseconds: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), milliseconds)
  })
  const settled = await Promise.race([promise.then(() => true), deadline])
  clearTimeout(timer)
  return settled
}

function blockResponseWithSize(size: number): string {
  const body = { result: { number: '0x1', timestamp: '0x2', padding: '' } }
  body.result.padding = 'a'.repeat(size - Buffer.byteLength(JSON.stringify(body)))
  return JSON.stringify(body)
}

describe('when a provider reads bounded RPC responses', () => {
  let server: Server
  let provider: AuthChainProvider
  let answer: (response: ServerResponse) => void
  let responseClosed: Promise<void>
  let outcome: Outcome

  beforeEach(async () => {
    let resolveResponseClosed: () => void
    responseClosed = new Promise((resolve) => {
      resolveResponseClosed = resolve
    })
    server = createServer((request, response) => {
      request.resume()
      response.on('close', () => resolveResponseClosed())
      answer(response)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    provider = createSignatureRpcProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      timeoutInMilliseconds: 5_000
    })
  })

  afterEach(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('and Content-Length exceeds the body limit before the body arrives', () => {
    let closed: boolean

    beforeEach(async () => {
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': LIMIT + 1 })
        response.flushHeaders()
      }
      outcome = await settle(provider, 'eth_call')
      closed = await within(responseClosed, 1_000)
    })

    it('should reject the response without waiting for its body', () => {
      expect(outcome.error?.message).toBe('RPC response exceeds size limit')
    })

    it('should cancel the unfinished response', () => {
      expect(closed).toBe(true)
    })
  })

  describe('and a chunked body exceeds the limit without Content-Length', () => {
    let closed: boolean

    beforeEach(async () => {
      const body = blockResponseWithSize(LIMIT + 1)
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        // The response is left open so only a cancel can close it.
        response.write(body.slice(0, LIMIT / 2))
        response.write(body.slice(LIMIT / 2))
      }
      outcome = await settle(provider, 'eth_getBlockByNumber')
      closed = await within(responseClosed, 1_000)
    })

    it('should reject the response at the byte limit', () => {
      expect(outcome.error?.message).toBe('RPC response exceeds size limit')
    })

    it('should cancel the unfinished response', () => {
      expect(closed).toBe(true)
    })
  })

  describe('and a gzip body expands beyond the limit despite its small Content-Length', () => {
    beforeEach(async () => {
      const compressedBody = gzipSync(blockResponseWithSize(LIMIT + 1))
      answer = (response) => {
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': compressedBody.byteLength
        })
        response.end(compressedBody)
      }
      outcome = await settle(provider, 'eth_getBlockByNumber')
    })

    it('should enforce the limit on decompressed bytes', () => {
      expect(outcome.error?.message).toBe('RPC response exceeds size limit')
    })
  })

  describe('and a block response is exactly one MiB', () => {
    let expectedResponse: JsonRpcResponse

    beforeEach(async () => {
      const body = blockResponseWithSize(LIMIT)
      expectedResponse = { id: 7, jsonrpc: '2.0', result: JSON.parse(body).result }
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
        response.end(body)
      }
      outcome = await settle(provider, 'eth_getBlockByNumber')
    })

    it('should accept the full response at the limit', () => {
      expect(outcome).toEqual({ error: null, response: expectedResponse })
    })
  })

  describe('and a completed block response exceeds one MiB by one byte', () => {
    beforeEach(async () => {
      const body = blockResponseWithSize(LIMIT + 1)
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(body)
      }
      outcome = await settle(provider, 'eth_getBlockByNumber')
    })

    it('should reject the first byte beyond the limit', () => {
      expect(outcome.error?.message).toBe('RPC response exceeds size limit')
    })
  })

  describe('and a response fits in one MiB of characters but exceeds it in UTF-8 bytes', () => {
    beforeEach(async () => {
      const body = JSON.stringify({ result: { number: '0x1', padding: 'é'.repeat(LIMIT / 2) } })
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(body)
      }
      outcome = await settle(provider, 'eth_getBlockByNumber')
    })

    it('should count encoded bytes rather than characters', () => {
      expect(outcome.error?.message).toBe('RPC response exceeds size limit')
    })
  })

  describe.each([
    ['a standard ABI word', '0x1626ba7e' + '0'.repeat(56)],
    ['a short hex response', '0x1626ba7e'],
    ['an empty hex response', '0x'],
    ['uppercase hex digits', '0x1626BA7E']
  ])('and eth_call returns %s', (_description, result) => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ result }))
      outcome = await settle(provider, 'eth_call')
    })

    it('should preserve the valid hexadecimal result', () => {
      expect(outcome).toEqual({ error: null, response: { id: 7, jsonrpc: '2.0', result } })
    })
  })

  describe.each([
    ['more than one ABI word', '0x' + 'a'.repeat(66)],
    ['an object', { number: '0x1' }],
    ['nonhexadecimal characters', '0xzz'],
    ['an odd number of hex digits', '0x1'],
    ['a string without a hex prefix', '1626ba7e'],
    ['an uppercase hex prefix', '0X1626ba7e']
  ])('and eth_call returns %s', (_description, result) => {
    beforeEach(async () => {
      answer = (response) => response.end(JSON.stringify({ result }))
      outcome = await settle(provider, 'eth_call')
    })

    it('should reject the result before handing it to the ABI decoder', () => {
      expect(outcome.error?.message).toBe('Invalid eth_call result')
    })
  })
})
