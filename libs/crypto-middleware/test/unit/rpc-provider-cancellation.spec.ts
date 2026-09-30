import { createServer } from 'http'
import { createRpcProvider } from '../../src/rpc-provider'
import type { AuthChainProvider } from '../../src/rpc-provider'
import type { Server } from 'http'
import type { AddressInfo } from 'net'

describe('when an L1 request is cancelled while its response body is stalled', () => {
  let server: Server
  let controller: AbortController
  let provider: AuthChainProvider
  let responseStarted: Promise<void>
  let responseClosed: Promise<void>
  let resolveResponseStarted: () => void
  let resolveResponseClosed: () => void
  let request: Promise<unknown>
  let fetchSpy: jest.SpyInstance
  let originalFetch: typeof fetch

  beforeEach(async () => {
    controller = new AbortController()
    responseStarted = new Promise((resolve) => {
      resolveResponseStarted = resolve
    })
    responseClosed = new Promise((resolve) => {
      resolveResponseClosed = resolve
    })
    server = createServer((_request, response) => {
      response.on('close', () => resolveResponseClosed())
      response.writeHead(200, { 'content-type': 'application/json' })
      response.write('{"jsonrpc":"2.0","id":1,"result":"')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    provider = createRpcProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}`)
    originalFetch = globalThis.fetch
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(async (...args) => {
      const response = await originalFetch(...args)
      resolveResponseStarted()
      return response
    })
    request = new Promise((resolve, reject) => {
      provider.sendAsync(
        { id: 1, method: 'eth_call', params: [] },
        (error, response) => (error ? reject(error) : resolve(response)),
        controller.signal
      )
    })
    await responseStarted
  })

  afterEach(async () => {
    fetchSpy.mockRestore()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  it('should reject the request and close the stalled response before its RPC timeout', async () => {
    controller.abort()

    await expect(request).rejects.toThrow('RPC request cancelled')
    await responseClosed
  })
})

describe('when an L1 request uses an already cancelled validation signal', () => {
  let controller: AbortController
  let provider: AuthChainProvider
  let callback: jest.Mock
  let fetchSpy: jest.SpyInstance

  beforeEach(async () => {
    controller = new AbortController()
    controller.abort()
    provider = createRpcProvider('http://127.0.0.1:1')
    callback = jest.fn()
    fetchSpy = jest.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should return cancellation without starting an RPC request', () => {
    provider.sendAsync({ id: 1, method: 'eth_call', params: [] }, callback, controller.signal)

    expect(callback).toHaveBeenCalledWith(new Error('RPC request cancelled'), undefined)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
