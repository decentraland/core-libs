import { createServer } from 'http'
import { gzipSync } from 'zlib'
import { createRpcProvider } from '../../src/rpc-provider'
import type { AuthChainProvider, JsonRpcResponse } from '../../src/rpc-provider'
import type { Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'

function send(provider: AuthChainProvider, method = 'eth_call'): Promise<JsonRpcResponse | undefined> {
  return new Promise((resolve, reject) => {
    provider.sendAsync({ id: 7, method, params: [] }, (error, response) => (error ? reject(error) : resolve(response)))
  })
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
  let resolveResponseClosed: () => void
  let limit: number

  beforeEach(async () => {
    limit = 1024 * 1024
    responseClosed = new Promise((resolve) => {
      resolveResponseClosed = resolve
    })
    server = createServer((request, response) => {
      request.resume()
      response.on('close', () => resolveResponseClosed())
      answer(response)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    provider = createRpcProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      timeoutInMilliseconds: 2_000
    })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('and Content-Length exceeds the body limit before the body arrives', () => {
    beforeEach(() => {
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': limit + 1 })
        response.flushHeaders()
      }
    })

    it('should reject immediately and cancel the unfinished response', async () => {
      await expect(send(provider)).rejects.toThrow('RPC response exceeds size limit')
      await responseClosed
    })
  })

  describe('and a chunked body exceeds the limit without Content-Length', () => {
    let body: string

    beforeEach(() => {
      body = blockResponseWithSize(limit + 1)
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.write(body.slice(0, limit / 2))
        response.write(body.slice(limit / 2))
      }
    })

    it('should stop reading and cancel the unfinished response at the byte limit', async () => {
      await expect(send(provider, 'eth_getBlockByNumber')).rejects.toThrow('RPC response exceeds size limit')
      await responseClosed
    })
  })

  describe('and a gzip body expands beyond the limit despite its small Content-Length', () => {
    let compressedBody: Buffer

    beforeEach(() => {
      compressedBody = gzipSync(blockResponseWithSize(limit + 1))
      answer = (response) => {
        response.writeHead(200, {
          'content-type': 'application/json',
          'content-encoding': 'gzip',
          'content-length': compressedBody.byteLength
        })
        response.end(compressedBody)
      }
    })

    it('should enforce the limit on decompressed bytes', async () => {
      await expect(send(provider, 'eth_getBlockByNumber')).rejects.toThrow('RPC response exceeds size limit')
    })
  })

  describe('and a block response is exactly one MiB', () => {
    let body: string
    let expectedResponse: JsonRpcResponse

    beforeEach(() => {
      body = blockResponseWithSize(limit)
      expectedResponse = { id: 7, jsonrpc: '2.0', result: JSON.parse(body).result }
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) })
        response.end(body)
      }
    })

    it('should accept the full response at the limit', async () => {
      await expect(send(provider, 'eth_getBlockByNumber')).resolves.toEqual(expectedResponse)
    })
  })

  describe('and a completed block response exceeds one MiB by one byte', () => {
    let body: string

    beforeEach(() => {
      body = blockResponseWithSize(limit + 1)
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(body)
      }
    })

    it('should reject the first byte beyond the limit', async () => {
      await expect(send(provider, 'eth_getBlockByNumber')).rejects.toThrow('RPC response exceeds size limit')
    })
  })

  describe('and a response fits in one MiB of characters but exceeds it in UTF-8 bytes', () => {
    let body: string

    beforeEach(() => {
      body = JSON.stringify({ result: { number: '0x1', padding: 'é'.repeat(limit / 2) } })
      answer = (response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(body)
      }
    })

    it('should count encoded bytes rather than characters', async () => {
      await expect(send(provider, 'eth_getBlockByNumber')).rejects.toThrow('RPC response exceeds size limit')
    })
  })

  describe.each([
    ['a standard ABI word', '0x1626ba7e' + '0'.repeat(56)],
    ['a short hex response', '0x1626ba7e'],
    ['an empty hex response', '0x']
  ])('and eth_call returns %s', (_description, result) => {
    let expectedResponse: JsonRpcResponse

    beforeEach(() => {
      expectedResponse = { id: 7, jsonrpc: '2.0', result }
      answer = (response) => response.end(JSON.stringify({ result }))
    })

    it('should preserve the valid hexadecimal result', async () => {
      await expect(send(provider)).resolves.toEqual(expectedResponse)
    })
  })

  describe.each([
    ['more than one ABI word', '0x' + 'a'.repeat(66)],
    ['an object', { number: '0x1' }],
    ['nonhexadecimal characters', '0xzz'],
    ['an odd number of hex digits', '0x1'],
    ['a string without a hex prefix', '1626ba7e']
  ])('and eth_call returns %s', (_description, result) => {
    beforeEach(() => {
      answer = (response) => response.end(JSON.stringify({ result }))
    })

    it('should reject the result before handing it to the ABI decoder', async () => {
      await expect(send(provider)).rejects.toThrow('Invalid eth_call result')
    })
  })
})
