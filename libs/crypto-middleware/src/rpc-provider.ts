const DEFAULT_RPC_TIMEOUT_IN_MILLISECONDS = 5_000
const MAX_ERROR_MESSAGE_LENGTH = 200

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
 * Each request is bounded by a deadline that covers the response body. Whatever the RPC answers is
 * reduced to a well-formed JSON-RPC response before it is handed on, so any failure — an error
 * status, an unreadable or malformed body, a timeout — is reported through the callback as an error
 * rather than escaping from it.
 */
export function createRpcProvider(
  url: string,
  { timeoutInMilliseconds = DEFAULT_RPC_TIMEOUT_IN_MILLISECONDS }: { timeoutInMilliseconds?: number } = {}
): AuthChainProvider {
  async function call(payload: JsonRpcRequest, signal: AbortSignal): Promise<JsonRpcResponse> {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...payload, jsonrpc: '2.0' }),
      signal
    })

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new Error(`RPC request failed with status ${response.status}`)
    }

    return toJsonRpcResponse(payload.id, JSON.parse(await response.text()))
  }

  return {
    sendAsync(payload, callback, validationSignal) {
      if (validationSignal?.aborted) {
        deliver(callback, new Error('RPC request cancelled'))
        return
      }

      const timeoutSignal = AbortSignal.timeout(timeoutInMilliseconds)
      // Node 22 supports `any`, but the project's TypeScript DOM declarations predate it.
      const abortSignal = AbortSignal as typeof AbortSignal & { any(signals: AbortSignal[]): AbortSignal }
      const signal = validationSignal ? abortSignal.any([timeoutSignal, validationSignal]) : timeoutSignal
      call(payload, signal).then(
        (response) => deliver(callback, null, response),
        (error) => {
          const reason = validationSignal?.aborted
            ? 'RPC request cancelled'
            : timeoutSignal.aborted
              ? 'RPC request timed out'
              : error instanceof Error
                ? error.message
                : 'RPC request failed'
          deliver(callback, new Error(reason))
        }
      )
    }
  }
}

/**
 * Keeps only what a JSON-RPC response is allowed to carry: the request's id, and either a result or
 * an error with a string message. Anything else is rejected as invalid.
 */
function toJsonRpcResponse(id: JsonRpcRequest['id'], body: unknown): JsonRpcResponse {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new Error('Invalid JSON-RPC response')
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
    throw new Error('Invalid JSON-RPC response')
  }

  return { jsonrpc: '2.0', id, result }
}

/**
 * The callback belongs to the caller and runs its own handling of the response synchronously. A
 * throw from it is contained here: the request then never settles, and the caller's deadline ends it.
 */
function deliver(callback: JsonRpcCallback, error: Error | null, response?: JsonRpcResponse): void {
  try {
    callback(error, response)
  } catch {
    // Nothing to recover: the caller's own deadline rejects the validation.
  }
}
