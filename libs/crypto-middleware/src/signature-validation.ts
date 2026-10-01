import { Authenticator } from '@dcl/crypto'
import type { AuthChain } from '@dcl/crypto'
import { DEFAULT_MAX_CHAIN_LENGTH } from './types'
import type { AuthChainProvider, JsonRpcRequest, JsonRpcResponse } from './rpc-provider'

/** Default maximum shared with signed-fetch header extraction. */
export const MAX_AUTH_CHAIN_LENGTH = DEFAULT_MAX_CHAIN_LENGTH
const DEFAULT_SIGNATURE_VALIDATION_TIMEOUT_IN_MILLISECONDS = 15_000

/** Infrastructure failures contain only safe diagnostics and must not be treated as invalid signatures. */
export class SignatureValidationInfrastructureError extends Error {
  constructor(message: 'RPC request failed' | 'Signature validation timed out' = 'RPC request failed') {
    super(message)
    this.name = 'SignatureValidationInfrastructureError'
  }
}

export interface SignatureValidationOptions {
  maxChainLength?: number
  timeoutInMilliseconds?: number
}

/**
 * Validates an identity or signed-fetch chain with bounded RPC work.
 * The scoped provider stops new calls after completion and aborts an in-flight fetch on timeout.
 * @param authChain Chain to validate, including its SIGNER link.
 * @param expectedFinalAuthority Ephemeral address or signed-fetch payload expected at the end.
 * @param l1Provider Provider for this environment's Ethereum network.
 * @throws SignatureValidationInfrastructureError when RPC infrastructure fails or validation times out.
 * @throws Error when the chain or validation options are invalid.
 */
export async function validateAuthChainSignature(
  authChain: AuthChain,
  expectedFinalAuthority: string,
  l1Provider: AuthChainProvider,
  {
    maxChainLength = MAX_AUTH_CHAIN_LENGTH,
    timeoutInMilliseconds = DEFAULT_SIGNATURE_VALIDATION_TIMEOUT_IN_MILLISECONDS
  }: SignatureValidationOptions = {}
): Promise<void> {
  if (
    !Number.isSafeInteger(maxChainLength) ||
    maxChainLength < 1 ||
    !Number.isSafeInteger(timeoutInMilliseconds) ||
    timeoutInMilliseconds < 1 ||
    timeoutInMilliseconds > 2_147_483_647
  ) {
    throw new Error('Validation limits must be positive integers and the timeout must fit a Node timer')
  }
  if (!authChain.length) {
    throw new Error('Auth chain is required')
  }
  if (authChain.length > maxChainLength) {
    throw new Error(`Auth chain exceeds maximum length of ${maxChainLength}`)
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(authChain[0].payload)) {
    throw new Error('Invalid auth chain signer address')
  }

  const controller = new AbortController()
  let rejectInfrastructureFailure: (error: SignatureValidationInfrastructureError) => void
  const infrastructureFailure = new Promise<never>((_resolve, reject) => {
    rejectInfrastructureFailure = reject
  })
  const failInfrastructure = (error = new SignatureValidationInfrastructureError()) => {
    if (!controller.signal.aborted) {
      // Reject independently of crypto: its ERC-1271 fallback intentionally swallows RPC errors.
      rejectInfrastructureFailure(error)
      controller.abort(error)
    }
    return error
  }
  const scopedProvider: AuthChainProvider = {
    sendAsync(payload, callback) {
      if (controller.signal.aborted) {
        callback(new SignatureValidationInfrastructureError())
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
    () => failInfrastructure(new SignatureValidationInfrastructureError('Signature validation timed out')),
    timeoutInMilliseconds
  )

  try {
    const validationResult = await Promise.race([
      Authenticator.validateSignature(expectedFinalAuthority, authChain, scopedProvider),
      infrastructureFailure
    ])
    if (!validationResult.ok) {
      throw new Error(validationResult.message ?? 'Signature validation failed')
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}

/** Preserve known EVM reverts for crypto's fallback, while keeping provider diagnostics private. */
function sanitizeResponse(payload: JsonRpcRequest, response: JsonRpcResponse | undefined): JsonRpcResponse {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new SignatureValidationInfrastructureError()
  }
  if ('error' in response && response.error !== undefined && response.error !== null) {
    const error = response.error
    const isRevert =
      payload.method === 'eth_call' &&
      (error.code === 3 ||
        (error.code === -32000 &&
          typeof error.message === 'string' &&
          /^(?:execution reverted|VM Exception while processing transaction: revert)(?:$|[\s:])/i.test(error.message)))
    if (!isRevert) {
      throw new SignatureValidationInfrastructureError()
    }
    return { jsonrpc: '2.0', id: payload.id, error: { code: error.code, message: 'execution reverted' } }
  }
  if (!('result' in response)) {
    throw new SignatureValidationInfrastructureError()
  }
  const result = response.result
  if (
    (payload.method === 'eth_call' && (typeof result !== 'string' || !/^0x(?:[a-fA-F0-9]{2}){0,32}$/.test(result))) ||
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
