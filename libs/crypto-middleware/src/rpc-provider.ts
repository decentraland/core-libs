const DEFAULT_RPC_TIMEOUT_IN_MILLISECONDS = 5_000
const MAX_ERROR_MESSAGE_LENGTH = 200
const MAX_RPC_RESPONSE_BYTES = 1024 * 1024

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
 * Ethereum provider used to validate signatures from accounts with code behind them: contract
 * wallets, and EOAs delegated to one through EIP-7702. Those sign under ERC-1271, which can only be
 * checked by calling the account on chain. Plain EOA signatures are still verified offline and never
 * reach it.
 *
 * Each request is bounded by a deadline and a 1 MiB response limit, including decoded bodies.
 * This signature-verification provider only accepts up to one ABI word from `eth_call`.
 * Responses are reduced to well-formed JSON-RPC before reaching the callback. HTTP errors,
 * unreadable or malformed bodies, and timeouts are reported through the callback as errors.
 * Use this specialized provider with `validateAuthChainSignature`, which supplies the overall
 * validation deadline and cancellation for dependency callbacks.
 *
 * @param url HTTP(S) RPC endpoint without user information.
 * @param options Per-request timeout, including response-body reads.
 * @throws When the endpoint or timeout configuration is invalid.
 */
export function createRpcProvider(
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
  if (
    !Number.isSafeInteger(timeoutInMilliseconds) ||
    timeoutInMilliseconds < 1 ||
    timeoutInMilliseconds > 2_147_483_647
  ) {
    throw new Error('RPC timeout must be a positive integer that fits a Node timer')
  }

  async function call(payload: JsonRpcRequest, signal: AbortSignal): Promise<JsonRpcResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, jsonrpc: '2.0' }),
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
    const result = toJsonRpcResponse(payload.id, body)
    if (
      payload.method === 'eth_call' &&
      'result' in result &&
      (typeof result.result !== 'string' || !/^0x(?:[a-fA-F0-9]{2}){0,32}$/.test(result.result))
    ) {
      throw new RpcResponseError('Invalid eth_call result')
    }
    return result
  }

  return {
    sendAsync(payload, callback, validationSignal) {
      if (validationSignal?.aborted) {
        deliver(callback, new Error('RPC request cancelled'))
        return
      }

      const timeoutSignal = AbortSignal.timeout(timeoutInMilliseconds)
      const signal = validationSignal ? AbortSignal.any([timeoutSignal, validationSignal]) : timeoutSignal
      call(payload, signal).then(
        (response) => deliver(callback, null, response),
        (error) => {
          const reason = validationSignal?.aborted
            ? 'RPC request cancelled'
            : timeoutSignal.aborted
              ? 'RPC request timed out'
              : error instanceof RpcResponseError
                ? error.message
                : 'RPC request failed'
          deliver(callback, new Error(reason))
        }
      )
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
 * an error with a string message. Anything else is rejected as invalid.
 */
function toJsonRpcResponse(id: JsonRpcRequest['id'], body: unknown): JsonRpcResponse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RpcResponseError('Invalid JSON-RPC response')
  }

  const { error, result } = body as { error?: unknown; result?: unknown }

  // `error: null` is how some RPCs say there is none.
  if (error !== undefined && error !== null) {
    const { code, message } = (typeof error === 'object' && error !== null ? error : {}) as {
      code?: unknown
      message?: unknown
    }
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: typeof code === 'number' ? code : -32603,
        message: typeof message === 'string' ? message.slice(0, MAX_ERROR_MESSAGE_LENGTH) : 'JSON-RPC error'
      }
    }
  }

  const isExpectedResult =
    typeof result === 'string' || (typeof result === 'object' && result !== null && !Array.isArray(result))
  if (!isExpectedResult) {
    throw new RpcResponseError('Invalid JSON-RPC response')
  }

  return { jsonrpc: '2.0', id, result }
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
