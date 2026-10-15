import { createServer } from 'http'
import type { AuthChain, AuthIdentity } from '@dcl/crypto'
import { AuthLinkType, Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { createSignatureRpcProvider, wellKnownComponents } from '../../src/index'
import { createPayload } from '../../src/verify'
import { identity, ownerAddress } from '../fixtures/identity'
import type { JsonRpcRequest } from '../../src/rpc-provider'
import type { Options } from '../../src/types'
import type { Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'

type Middleware = ReturnType<typeof wellKnownComponents>
type MiddlewareContext = Parameters<Middleware>[0]
type MiddlewareResponse = Awaited<ReturnType<Middleware>>
type RpcAnswer = (request: JsonRpcRequest, response: ServerResponse) => void

const METHOD = 'POST'
const PATH = '/identities'
const MAGIC_VALUE = '0x1626ba7e' + '0'.repeat(56)
const ZERO_WORD = '0x' + '0'.repeat(64)
const METADATA = { intent: 'ContractLogin' }

/** Exposes the RPC failure reason the default formatter hides behind a generic 5xx message. */
const exposeErrorMessage: Options['onError'] = (error) => ({ ok: false, message: error.message })

async function listen(handler: (request: JsonRpcRequest, response: ServerResponse) => void): Promise<Server> {
  const server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk) => {
      body += chunk
    })
    request.on('end', () => handler(JSON.parse(body) as JsonRpcRequest, response))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return server
}

async function close(server: Server): Promise<void> {
  if (!server.listening) {
    return
  }
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
}

function urlOf(server: Server): string {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function respondWith(response: ServerResponse, request: JsonRpcRequest, result: unknown): void {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ id: request.id, jsonrpc: '2.0', result }))
}

/** A node whose signer contract answers eth_call with `callResult`; blocks are 1s and 1000s old. */
function contractWalletNode(callResult: string): RpcAnswer {
  return (request, response) => {
    if (request.method === 'eth_blockNumber') {
      respondWith(response, request, '0x64')
    } else if (request.method === 'eth_getBlockByNumber') {
      const isFirstBlock = request.params?.[0] === '0x1'
      respondWith(response, request, {
        number: isFirstBlock ? '0x1' : '0x64',
        timestamp: '0x' + (Math.floor(Date.now() / 1000) - (isFirstBlock ? 1000 : 1)).toString(16),
        transactions: []
      })
    } else {
      respondWith(response, request, callResult)
    }
  }
}

/** The fixture identity with its owner signing the delegation as an ERC-1271 contract wallet. */
function contractWalletIdentity(): AuthIdentity {
  return {
    ...identity,
    authChain: [identity.authChain[0], { ...identity.authChain[1], type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL }]
  }
}

function signedRequest(signer: AuthIdentity): MiddlewareContext {
  const timestamp = Date.now()
  const chain: AuthChain = Authenticator.signPayload(
    signer,
    createPayload(METHOD, PATH, String(timestamp), JSON.stringify(METADATA))
  )
  return {
    request: new Request('http://localhost' + PATH, {
      method: METHOD,
      headers: createAuthChainHeaders(chain, timestamp, METADATA)
    }),
    url: new URL('http://localhost' + PATH)
  } as MiddlewareContext
}

describe('when the middleware validates signatures against a local JSON-RPC node', () => {
  let rpcServer: Server
  let rpcRequests: JsonRpcRequest[]
  let answer: RpcAnswer
  let contractIdentity: AuthIdentity
  let context: MiddlewareContext
  let next: jest.MockedFunction<Parameters<Middleware>[1]>
  let response: MiddlewareResponse

  beforeEach(async () => {
    rpcRequests = []
    rpcServer = await listen((request, serverResponse) => {
      rpcRequests.push(request)
      answer(request, serverResponse)
    })
    contractIdentity = contractWalletIdentity()
    next = jest.fn()
    next.mockResolvedValueOnce({ status: 200 })
  })

  afterEach(async () => {
    jest.resetAllMocks()
    await close(rpcServer)
  })

  describe('and the signer is a contract wallet that accepts the delegation', () => {
    beforeEach(async () => {
      answer = contractWalletNode(MAGIC_VALUE)
      context = signedRequest(contractIdentity)
      response = await wellKnownComponents({ provider: createSignatureRpcProvider(urlOf(rpcServer)) })(context, next)
    })

    it('should let the request through to the handler', () => {
      expect(response).toEqual({ status: 200 })
    })

    it('should authenticate the request as the contract wallet', () => {
      expect(context.verification?.auth).toBe(ownerAddress)
    })

    it('should ask the signer contract to validate the delegation', () => {
      expect(rpcRequests).toEqual([
        expect.objectContaining({
          method: 'eth_call',
          params: [expect.objectContaining({ to: ownerAddress }), 'latest']
        })
      ])
    })
  })

  describe('and the contract wallet rejects the delegation', () => {
    beforeEach(async () => {
      answer = contractWalletNode(ZERO_WORD)
      context = signedRequest(contractIdentity)
      response = await wellKnownComponents({
        provider: createSignatureRpcProvider(urlOf(rpcServer)),
        onError: exposeErrorMessage
      })(context, next)
    })

    it('should respond with a 401 invalid signature', () => {
      expect(response).toEqual({
        status: 401,
        body: { ok: false, message: expect.stringMatching(/^Invalid signature: /) }
      })
    })

    it('should not call the next handler', () => {
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('and the node answers with an HTTP 500', () => {
    beforeEach(async () => {
      answer = (_request, serverResponse) => {
        serverResponse.statusCode = 500
        serverResponse.end('upstream SECRET-TOKEN failure')
      }
      context = signedRequest(contractIdentity)
      response = await wellKnownComponents({
        provider: createSignatureRpcProvider(urlOf(rpcServer)),
        onError: exposeErrorMessage
      })(context, next)
    })

    it('should respond with a 503 and the unavailable message', () => {
      expect(response).toEqual({ status: 503, body: { ok: false, message: 'Signature verification unavailable' } })
    })

    it('should not call the next handler', () => {
      expect(next).not.toHaveBeenCalled()
    })
  })

  describe('and the node answers with a redirect', () => {
    let redirectTarget: Server
    let redirectTargetRequests: number

    beforeEach(async () => {
      redirectTargetRequests = 0
      redirectTarget = await listen((request, serverResponse) => {
        redirectTargetRequests++
        respondWith(serverResponse, request, MAGIC_VALUE)
      })
      answer = (_request, serverResponse) => {
        serverResponse.statusCode = 307
        serverResponse.setHeader('location', urlOf(redirectTarget))
        serverResponse.end()
      }
      context = signedRequest(contractIdentity)
      response = await wellKnownComponents({
        provider: createSignatureRpcProvider(urlOf(rpcServer)),
        onError: exposeErrorMessage
      })(context, next)
    })

    afterEach(async () => {
      await close(redirectTarget)
    })

    it('should respond with a 503 and the unavailable message', () => {
      expect(response).toEqual({ status: 503, body: { ok: false, message: 'Signature verification unavailable' } })
    })

    it('should not follow the redirect', () => {
      expect(redirectTargetRequests).toBe(0)
    })
  })

  describe('and every signature comes from an EOA', () => {
    beforeEach(async () => {
      answer = contractWalletNode(MAGIC_VALUE)
      context = signedRequest(identity)
      response = await wellKnownComponents({ provider: createSignatureRpcProvider(urlOf(rpcServer)) })(context, next)
    })

    it('should authenticate the owner', () => {
      expect(context.verification?.auth).toBe(ownerAddress)
    })

    it('should not send any request to the node', () => {
      expect(rpcRequests).toHaveLength(0)
    })
  })
})

describe('when the middleware validates signatures against a JSON-RPC node that is down', () => {
  let next: jest.MockedFunction<Parameters<Middleware>[1]>
  let response: MiddlewareResponse

  beforeEach(async () => {
    const stoppedServer = await listen(() => undefined)
    const url = urlOf(stoppedServer)
    await close(stoppedServer)
    next = jest.fn()
    response = await wellKnownComponents({
      provider: createSignatureRpcProvider(url),
      onError: exposeErrorMessage
    })(signedRequest(contractWalletIdentity()), next)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  it('should respond with a 503 and the unavailable message', () => {
    expect(response).toEqual({ status: 503, body: { ok: false, message: 'Signature verification unavailable' } })
  })

  it('should not call the next handler', () => {
    expect(next).not.toHaveBeenCalled()
  })
})
