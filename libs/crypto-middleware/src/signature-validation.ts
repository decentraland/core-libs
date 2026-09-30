import { Authenticator } from '@dcl/crypto'
import type { AuthChain } from '@dcl/crypto'
import type { AuthChainProvider } from './rpc-provider'

/** Default maximum shared with signed-fetch header extraction. */
export const MAX_AUTH_CHAIN_LENGTH = 10

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
 * @throws When the chain is invalid, too long, or exceeds the validation deadline.
 */
export async function validateAuthChainSignature(
  authChain: AuthChain,
  expectedFinalAuthority: string,
  l1Provider: AuthChainProvider,
  { maxChainLength = MAX_AUTH_CHAIN_LENGTH, timeoutInMilliseconds = 15_000 }: SignatureValidationOptions = {}
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

  const controller = new AbortController()
  const timeoutError = new Error('Signature validation timed out')
  const scopedProvider: AuthChainProvider = {
    sendAsync(payload, callback) {
      if (controller.signal.aborted) {
        callback(timeoutError)
        return
      }
      l1Provider.sendAsync(payload, callback, controller.signal)
    }
  }
  let timer: NodeJS.Timeout | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(timeoutError)
      controller.abort(timeoutError)
    }, timeoutInMilliseconds)
  })

  try {
    const validationResult = await Promise.race([
      Authenticator.validateSignature(expectedFinalAuthority, authChain, scopedProvider),
      deadline
    ])
    if (!validationResult.ok) {
      throw new Error(validationResult.message ?? 'Signature validation failed')
    }
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
}
