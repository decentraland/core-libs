import { createServer } from 'http'
import { createSignatureRpcProvider } from '../../src/rpc-provider'
import type { AuthChainProvider, JsonRpcCallback, JsonRpcResponse } from '../../src/rpc-provider'
import type { RequestListener, Server } from 'http'
import type { AddressInfo } from 'net'

interface Outcome {
  callback: jest.Mock<void, Parameters<JsonRpcCallback>>
  error: Error | null
  response?: JsonRpcResponse
}

function start(provider: AuthChainProvider, signal?: AbortSignal): Promise<Outcome> {
  const callback = jest.fn<void, Parameters<JsonRpcCallback>>()
  return new Promise<Parameters<JsonRpcCallback>>((resolve) => {
    callback.mockImplementation((...args) => resolve(args))
    provider.sendAsync({ id: 1, method: 'eth_call', params: [] }, callback, signal)
  }).then(async ([error, response]) => {
    // Lets a duplicate invocation surface before asserting.
    await new Promise((resolve) => setTimeout(resolve, 20))
    return { callback, error, response }
  })
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

describe('when an RPC request runs against a local server', () => {
  let server: Server
  let handle: RequestListener
  let requestCount: number
  let requestReceived: Promise<void>
  let connectionClosed: Promise<void>
  let controller: AbortController
  let provider: AuthChainProvider
  let outcome: Outcome

  beforeEach(async () => {
    requestCount = 0
    controller = new AbortController()
    let resolveRequestReceived: () => void
    let resolveConnectionClosed: () => void
    requestReceived = new Promise((resolve) => {
      resolveRequestReceived = resolve
    })
    connectionClosed = new Promise((resolve) => {
      resolveConnectionClosed = resolve
    })
    server = createServer((request, response) => {
      requestCount++
      response.on('close', () => resolveConnectionClosed())
      resolveRequestReceived()
      handle(request, response)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    provider = createSignatureRpcProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
      timeoutInMilliseconds: 5_000
    })
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  })

  describe('and the validation signal is already aborted', () => {
    let fetchSpy: jest.SpyInstance

    beforeEach(async () => {
      fetchSpy = jest.spyOn(globalThis, 'fetch')
      handle = (_request, response) => response.end(JSON.stringify({ result: '0x' }))
      controller.abort()
      outcome = await start(provider, controller.signal)
    })

    it('should report the request as cancelled', () => {
      expect(outcome.error?.message).toBe('RPC request cancelled')
    })

    it('should invoke the callback once', () => {
      expect(outcome.callback).toHaveBeenCalledTimes(1)
    })

    it('should not start a fetch', () => {
      expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('should not send any request to the server', () => {
      expect(requestCount).toBe(0)
    })
  })

  describe('and the validation signal aborts before the response headers arrive', () => {
    let closed: boolean

    beforeEach(async () => {
      handle = (request) => request.resume()
      const pending = start(provider, controller.signal)
      await requestReceived
      controller.abort()
      outcome = await pending
      closed = await within(connectionClosed, 1_000)
    })

    it('should report the request as cancelled', () => {
      expect(outcome.error?.message).toBe('RPC request cancelled')
    })

    it('should invoke the callback once', () => {
      expect(outcome.callback).toHaveBeenCalledTimes(1)
    })

    it('should close the connection to the server', () => {
      expect(closed).toBe(true)
    })
  })

  describe('and the validation signal aborts while the response body is stalled', () => {
    let closed: boolean

    beforeEach(async () => {
      let resolveResponseStarted: () => void
      const responseStarted = new Promise<void>((resolve) => {
        resolveResponseStarted = resolve
      })
      const originalFetch = globalThis.fetch
      jest.spyOn(globalThis, 'fetch').mockImplementationOnce(async (...args) => {
        const response = await originalFetch(...args)
        resolveResponseStarted()
        return response
      })
      handle = (_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.write('{"jsonrpc":"2.0","id":1,"result":"')
      }
      const pending = start(provider, controller.signal)
      await responseStarted
      controller.abort()
      outcome = await pending
      closed = await within(connectionClosed, 1_000)
    })

    it('should report the request as cancelled', () => {
      expect(outcome.error?.message).toBe('RPC request cancelled')
    })

    it('should invoke the callback once', () => {
      expect(outcome.callback).toHaveBeenCalledTimes(1)
    })

    it('should close the stalled response', () => {
      expect(closed).toBe(true)
    })
  })

  describe('and the validation signal aborts after the request succeeds', () => {
    beforeEach(async () => {
      handle = (_request, response) => response.end(JSON.stringify({ result: '0x' }))
      const pending = start(provider, controller.signal)
      await requestReceived
      outcome = await pending
      controller.abort()
      // Gives a late cancellation a chance to invoke the callback again.
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    it('should deliver the result once', () => {
      expect(outcome.callback.mock.calls).toEqual([[null, { jsonrpc: '2.0', id: 1, result: '0x' }]])
    })
  })

  describe('and the per-request timeout elapses', () => {
    beforeEach(() => {
      provider = createSignatureRpcProvider(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, {
        timeoutInMilliseconds: 100
      })
    })

    describe('and the response headers never arrive', () => {
      let closed: boolean

      beforeEach(async () => {
        handle = (request) => request.resume()
        outcome = await start(provider, controller.signal)
        closed = await within(connectionClosed, 1_000)
      })

      it('should report the request as timed out', () => {
        expect(outcome.error?.message).toBe('RPC request timed out')
      })

      it('should invoke the callback once', () => {
        expect(outcome.callback).toHaveBeenCalledTimes(1)
      })

      it('should close the connection to the server', () => {
        expect(closed).toBe(true)
      })
    })

    describe('and the response body stalls', () => {
      let closed: boolean

      beforeEach(async () => {
        handle = (_request, response) => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.write('{"result":')
        }
        outcome = await start(provider)
        closed = await within(connectionClosed, 1_000)
      })

      it('should report the request as timed out', () => {
        expect(outcome.error?.message).toBe('RPC request timed out')
      })

      it('should invoke the callback once', () => {
        expect(outcome.callback).toHaveBeenCalledTimes(1)
      })

      it('should close the stalled response', () => {
        expect(closed).toBe(true)
      })
    })
  })
})
