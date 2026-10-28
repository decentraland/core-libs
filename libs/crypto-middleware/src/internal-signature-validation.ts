import { Authenticator } from '@dcl/crypto'
import type { AuthChain, ScopedLoginScope, ScopedLoginValidationOptions } from '@dcl/crypto'
import { isExecutionRevert, isSignatureCallResult, isTimerDuration, toRevertResponse } from './rpc-provider'
import { DEFAULT_MAX_CHAIN_LENGTH } from './types'
import type { AuthChainProvider, JsonRpcRequest, JsonRpcResponse } from './rpc-provider'

/** Default maximum shared with signed-fetch header extraction. */
export const MAX_AUTH_CHAIN_LENGTH = DEFAULT_MAX_CHAIN_LENGTH
const DEFAULT_SIGNATURE_VALIDATION_TIMEOUT_IN_MILLISECONDS = 15_000
/** A signature valid at the latest block needs at most two calls per EIP-1654 link; failures need more. */
const DEFAULT_MAX_RPC_CALLS = 16

/** Infrastructure failures contain only safe diagnostics and must not be treated as invalid signatures. */
export class SignatureValidationInfrastructureError extends Error {
  constructor(message: 'RPC request failed' | 'Signature validation timed out' = 'RPC request failed') {
    super(message)
    this.name = 'SignatureValidationInfrastructureError'
  }
}

export interface SignatureValidationOptions {
  /** Maximum number of links, including the SIGNER. Default: 10. */
  maxChainLength?: number
  /** Deadline for the whole validation, including every RPC call. Default: 15 seconds. */
  timeoutInMilliseconds?: number
  /** RPC calls one validation may make before it is rejected as invalid. Default: 16. */
  maxRpcCalls?: number
}

/**
 * Accepts scoped logins (ADR-162) for a service. Internal: the middleware uses it and checks the
 * route's operation against the returned scope, which a caller of an exported function could skip.
 */
export interface ScopedSignatureValidationOptions extends SignatureValidationOptions, ScopedLoginValidationOptions {}

/**
 * Validates an identity or signed-fetch chain with bounded RPC work.
 * The scoped provider stops new calls after completion and aborts an in-flight fetch on timeout.
 * Scoped logins (ADR-162) are always rejected: this function can't check the operation they are
 * used for. Accept them through the middleware's `service` and `operation` options.
 * @param authChain Chain to validate: a SIGNER link followed by at least one signature link.
 * @param expectedFinalAuthority Ephemeral address or signed-fetch payload expected at the end.
 * @param l1Provider Provider for this environment's Ethereum network.
 * @throws SignatureValidationInfrastructureError when RPC infrastructure fails or validation times out.
 * @throws Error when the chain is invalid, exceeds its RPC call budget, or the options are invalid.
 */
export async function validateAuthChainSignature(
  authChain: AuthChain,
  expectedFinalAuthority: string,
  l1Provider: AuthChainProvider,
  { maxChainLength, timeoutInMilliseconds, maxRpcCalls }: SignatureValidationOptions = {}
): Promise<void> {
  // Only the limits are passed on, so no option can make it accept a scoped login.
  await validateScopedAuthChainSignature(authChain, expectedFinalAuthority, l1Provider, {
    maxChainLength,
    timeoutInMilliseconds,
    maxRpcCalls
  })
}

/**
 * {@link validateAuthChainSignature}, accepting scoped logins (ADR-162) for `service` and returning
 * the scope of one, or undefined for a full login. Internal: the caller MUST check the operation of
 * the request against the scope.
 */
export async function validateScopedAuthChainSignature(
  authChain: AuthChain,
  expectedFinalAuthority: string,
  l1Provider: AuthChainProvider,
  {
    maxChainLength = MAX_AUTH_CHAIN_LENGTH,
    timeoutInMilliseconds = DEFAULT_SIGNATURE_VALIDATION_TIMEOUT_IN_MILLISECONDS,
    maxRpcCalls = DEFAULT_MAX_RPC_CALLS,
    service,
    maxScopedLoginLifetimeInMillis
  }: ScopedSignatureValidationOptions = {}
): Promise<ScopedLoginScope | undefined> {
  if (
    !Number.isSafeInteger(maxChainLength) ||
    maxChainLength < 2 ||
    !Number.isSafeInteger(maxRpcCalls) ||
    maxRpcCalls < 1 ||
    !isTimerDuration(timeoutInMilliseconds)
  ) {
    throw new Error(
      'Validation limits must be positive integers, chains must allow two links and the timeout must fit a Node timer'
    )
  }
  // A lone SIGNER link carries no signature and would make its payload the final authority.
  if (!Array.isArray(authChain) || authChain.length < 2) {
    throw new Error('Auth chain must contain a signer and at least one signed link')
  }
  if (authChain.length > maxChainLength) {
    throw new Error(`Auth chain exceeds maximum length of ${maxChainLength}`)
  }
  if (typeof authChain[0]?.payload !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(authChain[0].payload)) {
    throw new Error('Invalid auth chain signer address')
  }

  const controller = new AbortController()
  let rejectValidation: (error: Error) => void
  const interruption = new Promise<never>((_resolve, reject) => {
    rejectValidation = reject
  })
  // Reject independently of crypto: its ERC-1271 fallback intentionally swallows RPC errors.
  const interrupt = <E extends Error>(error: E): E => {
    if (!controller.signal.aborted) {
      rejectValidation(error)
      controller.abort(error)
    }
    return error
  }
  const failInfrastructure = () => interrupt(new SignatureValidationInfrastructureError())

  let rpcCalls = 0
  const scopedProvider: AuthChainProvider = {
    sendAsync(payload, callback) {
      if (controller.signal.aborted) {
        callback(new SignatureValidationInfrastructureError())
        return
      }
      // Rejected as invalid, not unavailable: the chain itself asks for more work than a valid one needs.
      if (++rpcCalls > maxRpcCalls) {
        callback(interrupt(new Error(`Auth chain validation exceeded ${maxRpcCalls} RPC calls`)))
        return
      }
      try {
        l1Provider.sendAsync(
          payload,
          (error, response) => {
            if (controller.signal.aborted) {
              callback(new SignatureValidationInfrastructureError())
              return
            }
            try {
              if (error) {
                callback(failInfrastructure())
                return
              }
              callback(null, sanitizeResponse(payload, response))
            } catch {
              callback(failInfrastructure())
            }
          },
          controller.signal
        )
      } catch {
        callback(failInfrastructure())
      }
    }
  }
  const timer = setTimeout(
    () => interrupt(new SignatureValidationInfrastructureError('Signature validation timed out')),
    timeoutInMilliseconds
  )

  try {
    const validationResult = await Promise.race([
      Authenticator.validateSignature(expectedFinalAuthority, authChain, scopedProvider, Date.now(), {
        service,
        maxScopedLoginLifetimeInMillis
      }),
      interruption
    ])
    if (!validationResult.ok) {
      throw new Error(validationResult.message ?? 'Signature validation failed')
    }
    return validationResult.scope
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/**
 * Re-checks every response, since callers may supply their own provider: keeps contract reverts for
 * crypto's fallback with a fixed message, and treats anything else unexpected as an outage.
 */
function sanitizeResponse(payload: JsonRpcRequest, response: JsonRpcResponse | undefined): JsonRpcResponse {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new SignatureValidationInfrastructureError()
  }
  if ('error' in response && response.error !== undefined && response.error !== null) {
    const error: { code?: unknown; message?: unknown } = typeof response.error === 'object' ? response.error : {}
    if (payload.method !== 'eth_call' || !isExecutionRevert(error)) {
      throw new SignatureValidationInfrastructureError()
    }
    return toRevertResponse(payload.id, error)
  }
  if (!('result' in response)) {
    throw new SignatureValidationInfrastructureError()
  }
  const result = response.result
  if (
    (payload.method === 'eth_call' && !isSignatureCallResult(result)) ||
    (payload.method === 'eth_blockNumber' && (typeof result !== 'string' || !/^0x[a-fA-F0-9]+$/.test(result))) ||
    (payload.method === 'eth_getBlockByNumber' &&
      (!result ||
        typeof result !== 'object' ||
        Array.isArray(result) ||
        !('timestamp' in result) ||
        typeof result.timestamp !== 'string' ||
        !/^0x[a-fA-F0-9]+$/.test(result.timestamp)))
  ) {
    throw new SignatureValidationInfrastructureError()
  }
  return { jsonrpc: '2.0', id: payload.id, result }
}
