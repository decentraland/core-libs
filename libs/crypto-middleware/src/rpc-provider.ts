const DEFAULT_RPC_TIMEOUT_IN_MILLISECONDS = 5_000
const MAX_RPC_RESPONSE_BYTES = 1024 * 1024
/** Largest delay a Node timer accepts without firing immediately. */
export const MAX_TIMER_MILLISECONDS = 2_147_483_647

/** Only errors produced here may be exposed to callers; native fetch errors can contain credentials. */
class RpcResponseError extends Error {}

export interface JsonRpcRequest {
  id: number | string
  jsonrpc?: string
  method: string
  params?: unknown[]
}
export type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: number | string; result: unknown }
  | { jsonrpc: '2.0'; id: number | string; error: { code: number; message: string } }
export type JsonRpcCallback = (error: Error | null, response?: JsonRpcResponse) => void

/**
 * The provider interface `@dcl/crypto` drives: one JSON-RPC request per `sendAsync` call.
 * The optional signal cancels both the request and reading its response body.
 */
export interface AuthChainProvider {
  sendAsync(payload: JsonRpcRequest, callback: JsonRpcCallback, signal?: AbortSignal): void
}

/**
 * Execution failures reported by geth, Erigon, Besu, Nethermind, Reth and Hardhat-style nodes. Out of gas
 * is excluded: hosted RPCs cap eth_call gas, so it can be a provider limit rather than a contract verdict.
 */
const EXECUTION_FAILURE_MESSAGE =
  /^(?:error: )?(?:execution reverted|reverted|vm execution error|vm exception while processing transaction|invalid opcode|stack underflow|stack overflow|invalid jump destination|write protection|return data out of bounds|evm error(?! out ?of ?gas))(?:$|[\s:.(])/i

/**
 * Whether a JSON-RPC error means the called contract failed, as opposed to the node or transport.
 * ERC-1271 wallets may revert for invalid signatures, so these must keep crypto's normal fallback.
 */
export function isExecutionRevert(error: { code?: unknown; message?: unknown }): boolean {
  return (
    error.code === 3 ||
    error.code === -32015 ||
    (typeof error.message === 'string' && EXECUTION_FAILURE_MESSAGE.test(error.message))
  )
}

/** A revert with a fixed message, so contract-chosen text never reaches callers. */
export function toRevertResponse(id: JsonRpcRequest['id'], error: { code?: unknown }): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: { code: typeof error.code === 'number' ? error.code : 3, message: 'execution reverted' }
  }
}

/** ERC-1271 returns a single `bytes4` padded to one ABI word; empty data means no code. */
export function isSignatureCallResult(result: unknown): result is string {
  return typeof result === 'string' && /^0x(?:[a-fA-F0-9]{2}){0,32}$/.test(result)
}

export function isTimerDuration(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_TIMER_MILLISECONDS
}

/**
 * Ethereum provider used to validate signatures from accounts with code behind them: contract
 * wallets, and EOAs delegated to one through EIP-7702. Those sign under ERC-1271, which can only be
 * checked by calling the account on chain. Plain EOA signatures are still verified offline and never
 * reach it.
 *
 * Each request is bounded by a deadline and a 1 MiB decoded response limit, and redirects are refused.
 * `eth_call` accepts at most one ABI word. Contract execution failures are reduced to a fixed
 * `execution reverted` error; any other upstream error, HTTP failure, malformed body or timeout is
 * reported through the callback as an error that never carries upstream text.
 * Use it with `validateAuthChainSignature` or the middleware, which add the validation deadline and
 * RPC call budget. It is not a general-purpose JSON-RPC client.
 *
 * @param url HTTP(S) RPC endpoint without user information.
 * @param options Per-request timeout, including response-body reads.
 * @throws When the endpoint or timeout configuration is invalid.
 */
export function createSignatureRpcProvider(
  url: string,
  { timeoutInMilliseconds = DEFAULT_RPC_TIMEOUT_IN_MILLISECONDS }: { timeoutInMilliseconds?: number } = {}
): AuthChainProvider {
  let endpoint: URL
  try {
    endpoint = new URL(url)
  } catch {
    throw new Error('RPC URL must be an HTTP(S) URL without user information')
  }
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('RPC URL must be an HTTP(S) URL without user information')
  }
  if (!isTimerDuration(timeoutInMilliseconds)) {
    throw new Error('RPC timeout must be a positive integer that fits a Node timer')
  }

  async function call(payload: JsonRpcRequest, signal: AbortSignal): Promise<JsonRpcResponse> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, jsonrpc: '2.0' }),
      // A redirect could hand validation to a different node or network.
      redirect: 'error',
      signal
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new RpcResponseError(`RPC request failed with status ${response.status}`)
    }

    const text = await readBoundedBody(response)
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      // JSON.parse errors can echo part of an upstream body, including private configuration.
      throw new RpcResponseError('Invalid JSON-RPC response')
    }
    return toJsonRpcResponse(payload, body)
  }

  return {
    sendAsync(payload, callback, validationSignal) {
      if (validationSignal?.aborted) {
        deliver(callback, new Error('RPC request cancelled'))
        return
      }

      const timeoutController = new AbortController()
      const timer = setTimeout(() => timeoutController.abort(), timeoutInMilliseconds)
      const signal = validationSignal
        ? AbortSignal.any([timeoutController.signal, validationSignal])
        : timeoutController.signal
      call(payload, signal)
        .then(
          (response) => deliver(callback, null, response),
          (error) => {
            const reason = validationSignal?.aborted
              ? 'RPC request cancelled'
              : timeoutController.signal.aborted
                ? 'RPC request timed out'
                : error instanceof RpcResponseError
                  ? error.message
                  : 'RPC request failed'
            deliver(callback, new Error(reason))
          }
        )
        .finally(() => clearTimeout(timer))
    }
  }
}

/** Reads at most 1 MiB, cancelling oversized streams before buffering or parsing their remainder. */
async function readBoundedBody(response: Response): Promise<string> {
  const contentLength = Number(response.headers.get('content-length'))
  if (contentLength > MAX_RPC_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined)
    throw new RpcResponseError('RPC response exceeds size limit')
  }
  if (!response.body) {
    throw new RpcResponseError('Invalid JSON-RPC response')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    let chunk = await reader.read()
    while (!chunk.done) {
      const { value } = chunk
      size += value.byteLength
      if (size > MAX_RPC_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined)
        throw new RpcResponseError('RPC response exceeds size limit')
      }
      chunks.push(value)
      chunk = await reader.read()
    }
    return Buffer.concat(chunks, size).toString('utf8')
  } finally {
    reader.releaseLock()
  }
}

/**
 * Keeps only what a JSON-RPC response is allowed to carry: the request's id, and either a result or
 * a contract revert with a fixed message. Anything else is rejected without echoing upstream text.
 */
function toJsonRpcResponse(payload: JsonRpcRequest, body: unknown): JsonRpcResponse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RpcResponseError('Invalid JSON-RPC response')
  }

  const { error, result } = body as { error?: unknown; result?: unknown }

  // `error: null` is how some RPCs say there is none.
  if (error !== undefined && error !== null) {
    const details = (typeof error === 'object' ? error : {}) as { code?: unknown; message?: unknown }
    if (payload.method === 'eth_call' && isExecutionRevert(details)) {
      return toRevertResponse(payload.id, details)
    }
    // Upstream messages can echo API keys or project ids, so only the numeric code is kept.
    throw new RpcResponseError(
      typeof details.code === 'number' && Number.isSafeInteger(details.code)
        ? `RPC returned error code ${details.code}`
        : 'RPC returned an error'
    )
  }

  const isExpectedResult =
    typeof result === 'string' || (typeof result === 'object' && result !== null && !Array.isArray(result))
  if (!isExpectedResult) {
    throw new RpcResponseError('Invalid JSON-RPC response')
  }
  if (payload.method === 'eth_call' && !isSignatureCallResult(result)) {
    throw new RpcResponseError('Invalid eth_call result')
  }

  return { jsonrpc: '2.0', id: payload.id, result }
}

/**
 * The crypto dependency handles the response synchronously inside this callback. Contain its
 * exceptions so they cannot become unhandled rejections; `validateAuthChainSignature` supplies
 * the deadline that terminates a validation whose callback failed before settling it.
 */
function deliver(callback: JsonRpcCallback, error: Error | null, response?: JsonRpcResponse): void {
  try {
    callback(error, response)
  } catch {
    // Nothing to recover: the caller's own deadline rejects the validation.
  }
}
