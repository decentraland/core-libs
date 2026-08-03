import { toQuantity } from './hex'

/** A block number, a `0x`-prefixed block hash/quantity, or a named block tag. */
export type BlockIdentifier = number | string

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params: unknown[]
}

interface JsonRpcResponse {
  result?: unknown
  error?: { code?: number; message?: string }
}

/**
 * The provider shapes accepted by {@link EthClient}. Covers EIP-1193
 * (`request`) as well as the older callback- and promise-style `sendAsync`/`send`
 * used by web3-era providers.
 * @public
 */
export interface EthProvider {
  request?(args: { method: string; params?: unknown[] }): Promise<unknown>
  sendAsync?(payload: JsonRpcRequest, callback: (err: unknown, result?: JsonRpcResponse) => void): void
  send?(payload: JsonRpcRequest, callback: (err: unknown, result?: JsonRpcResponse) => void): void
}

export interface RpcBlock {
  number: string | number
  timestamp: string | number
}

function unwrap(response: JsonRpcResponse | unknown): unknown {
  const body = response as JsonRpcResponse
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw new Error(body.error.message ?? 'JSON-RPC error')
  }
  if (body && typeof body === 'object' && 'result' in body) return body.result
  return body
}

/**
 * Minimal JSON-RPC client covering only the calls this package needs:
 * `eth_blockNumber`, `eth_getBlockByNumber` and `eth_call`.
 * @public
 */
export class EthClient {
  private nextId = 1

  constructor(private readonly provider: EthProvider) {
    if (!provider || typeof provider !== 'object') {
      throw new Error('Invalid provider')
    }
  }

  async send(method: string, params: unknown[] = []): Promise<unknown> {
    const provider = this.provider
    const payload: JsonRpcRequest = { jsonrpc: '2.0', id: this.nextId++, method, params }

    if (typeof provider.request === 'function') {
      return unwrap(await provider.request({ method, params }))
    }

    const dispatch = typeof provider.sendAsync === 'function' ? provider.sendAsync : provider.send
    if (typeof dispatch !== 'function') {
      throw new Error('Provider must implement request(), sendAsync() or send()')
    }

    // sendAsync is callback-style on web3-era providers but promise-returning on
    // some others; support both by racing the callback against the return value.
    return await new Promise((resolve, reject) => {
      let settled = false
      const done = (err: unknown, result?: JsonRpcResponse) => {
        if (settled) return
        settled = true
        if (err) reject(err instanceof Error ? err : new Error(String(err)))
        else {
          try {
            resolve(unwrap(result))
          } catch (e) {
            reject(e)
          }
        }
      }
      const returned = (dispatch as (p: JsonRpcRequest, cb: typeof done) => unknown).call(provider, payload, done)
      if (returned && typeof (returned as Promise<unknown>).then === 'function') {
        ;(returned as Promise<JsonRpcResponse>).then(
          (value) => done(null, value),
          (error) => done(error)
        )
      }
    })
  }

  async eth_blockNumber(): Promise<string> {
    return (await this.send('eth_blockNumber')) as string
  }

  async eth_getBlockByNumber(block: BlockIdentifier, fullTransactions = false): Promise<RpcBlock> {
    const tag = typeof block === 'number' ? toQuantity(block) : block
    return (await this.send('eth_getBlockByNumber', [tag, fullTransactions])) as RpcBlock
  }

  async eth_call(to: string, data: string, block: BlockIdentifier = 'latest'): Promise<string> {
    const tag = typeof block === 'number' ? toQuantity(block) : block
    return (await this.send('eth_call', [{ to, data }, tag])) as string
  }
}
