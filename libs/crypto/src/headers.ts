// Decentraland signed-fetch HTTP header names. Centralized here so that signing
// libraries (decentraland-crypto-fetch) and verifying libraries (@dcl/crypto-middleware)
// always agree on the wire protocol — drift here silently breaks authentication.

import type { AuthChain } from './types'

export const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-' as const
export const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp' as const
export const AUTH_METADATA_HEADER = 'x-identity-metadata' as const

/**
 * Serializes a signed AuthChain into the `x-identity-*` headers the DCL signed-fetch
 * flow expects. This is serialization only — it does not sign anything; build the
 * chain first with `Authenticator.signPayload` (or equivalent) and pass it in here.
 *
 * Returns a plain headers object rather than a serialized blob so HTTP consumers can
 * spread it directly into `fetch` headers, while consumers that need a serialized
 * blob (e.g. a proto `bytes` field) can `JSON.stringify()` the result themselves.
 */
export function createAuthChainHeaders(
  authChain: AuthChain,
  timestamp: number,
  metadata: Record<string, unknown> = {}
): Record<string, string> {
  const headers = {} as Record<string, string>

  authChain.forEach((link, index) => {
    headers[AUTH_CHAIN_HEADER_PREFIX + index] = JSON.stringify(link)
  })

  headers[AUTH_TIMESTAMP_HEADER] = String(timestamp)
  headers[AUTH_METADATA_HEADER] = JSON.stringify(metadata)

  return headers
}
