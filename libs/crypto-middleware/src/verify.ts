import { Authenticator, AuthChain, AuthLinkType } from '@dcl/crypto'
import RequestError from './errors'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DecentralandSignatureData,
  DEFAULT_CATALYST,
  DEFAULT_EXPIRATION,
  VerifyAuthChainHeadersOptions
} from './types'

const MAX_CHAIN_LENGTH = 10

export function isEIP1654AuthChain(authChain: AuthChain) {
  switch (authChain.length) {
    case 2:
    case 3:
      return authChain[0].type === AuthLinkType.SIGNER && authChain[1].type === AuthLinkType.ECDSA_EIP_1654_EPHEMERAL
    default:
      return false
  }
}

export function extractAuthChain(headers: Record<string, string | string[] | undefined>) {
  const chain: AuthChain = []
  for (let index = 0; index < MAX_CHAIN_LENGTH; index++) {
    const raw = headers[AUTH_CHAIN_HEADER_PREFIX + index]
    if (!raw) break

    const item = Array.isArray(raw) ? raw[0] : raw
    try {
      chain.push(JSON.parse(item))
    } catch (err: any) {
      throw new RequestError(`Invalid chain format: ${err.message}`, 400)
    }
  }

  if (headers[AUTH_CHAIN_HEADER_PREFIX + MAX_CHAIN_LENGTH]) {
    throw new RequestError(`Auth chain exceeds maximum length of ${MAX_CHAIN_LENGTH}`, 400)
  }

  if (chain.length <= 1) {
    throw new RequestError(`Invalid Auth Chain`, 400)
  }

  return chain
}

export async function verifyPersonalSign(authChain: AuthChain, payload: string) {
  // The third argument is an HTTPProvider used for contract-wallet (EIP-1654) validation.
  // Personal signatures don't need one; EIP-1654 chains are routed to verifyEIP1654Sign
  // instead, which hits the catalyst. Cast silences the typed-provider requirement.
  const verification = await Authenticator.validateSignature(payload, authChain, null as any)

  if (!verification.ok) {
    throw new RequestError(`Invalid signature: ${verification.message}`, 401)
  }

  return Authenticator.ownerAddress(authChain).toLowerCase()
}

export async function verifyEIP1654Sign(
  authChain: AuthChain,
  payload: string,
  options: Pick<VerifyAuthChainHeadersOptions, 'catalyst' | 'fetcher'> = {}
) {
  const catalyst = new URL(options.catalyst ?? DEFAULT_CATALYST)
  const ownerAddress = Authenticator.ownerAddress(authChain).toLowerCase()
  const url = `${catalyst.origin}/lambdas/crypto/validate-signature`
  const init = {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({ authChain, timestamp: payload })
  }

  let response: { text: () => Promise<string> }
  try {
    response = options.fetcher ? await options.fetcher.fetch(url, init as any) : await fetch(url, init)
  } catch (err: any) {
    throw new RequestError(`Error connecting to catalyst "${catalyst.origin}": ${err.message}`, 503)
  }

  let verification: { ownerAddress: string; valid: boolean }
  try {
    const body = await response.text()
    const parsed = JSON.parse(body)
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.valid !== 'boolean' ||
      typeof parsed.ownerAddress !== 'string'
    ) {
      throw new Error('unexpected response shape')
    }
    verification = parsed
  } catch (err: any) {
    throw new RequestError(`Invalid response from catalyst "${catalyst.origin}": ${err.message}`, 503)
  }

  if (!verification.valid || verification.ownerAddress.toLowerCase() !== ownerAddress) {
    throw new RequestError(`Invalid signature`, 401)
  }

  return ownerAddress
}

export function verifySign(
  authChain: AuthChain,
  payload: string,
  options: Pick<VerifyAuthChainHeadersOptions, 'catalyst' | 'fetcher'> = {}
) {
  if (isEIP1654AuthChain(authChain)) {
    return verifyEIP1654Sign(authChain, payload, options)
  }

  return verifyPersonalSign(authChain, payload)
}

export function verifyTimestamp(value?: string | string[]) {
  const timestamp = Number(value || '0')
  if (value && !Number.isFinite(timestamp)) {
    throw new RequestError(`Invalid chain timestamp: ${value}`, 400)
  }

  return timestamp
}

export function verifyMetadata(value?: string | string[]): Record<string, any> {
  let parsed: unknown
  try {
    parsed = JSON.parse(value ? String(value) : '{}')
  } catch (err: any) {
    throw new RequestError(`Invalid chain metadata: "${value}"`, 400)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new RequestError(`Invalid chain metadata: "${value}"`, 400)
  }

  return parsed as Record<string, any>
}

export function verifyExpiration(
  timestamp: number,
  options: Pick<VerifyAuthChainHeadersOptions, 'expiration'> = {}
): void {
  const expiration = options.expiration ?? DEFAULT_EXPIRATION
  const now = Date.now()
  if (timestamp + expiration < now) {
    throw new RequestError(
      `Expired signature: signature timestamp: ${timestamp}, timestamp expiration: ${
        timestamp + expiration
      }, local timestamp: ${now}`,
      401
    )
  }
}

export function createPayload(
  method: string,
  path: string,
  rawTimestamp: string | string[] | undefined,
  rawMetadata: string | string[] | undefined
) {
  return [method, path, rawTimestamp, rawMetadata].join(':').toLowerCase()
}

export default async function verify<P extends Record<string, any> = Record<string, any>>(
  method: string,
  path: string,
  headers: Record<string, string | string[] | undefined>,
  options: VerifyAuthChainHeadersOptions<P> = {}
): Promise<DecentralandSignatureData<P>> {
  const authChain = extractAuthChain(headers)
  const timestamp = verifyTimestamp(headers[AUTH_TIMESTAMP_HEADER])
  const metadata = verifyMetadata(headers[AUTH_METADATA_HEADER]) as P

  if (options.metadataValidator && !options.metadataValidator(metadata)) {
    throw new RequestError(`Invalid metadata content: ${JSON.stringify(metadata)}`, 400)
  }

  verifyExpiration(timestamp, options)

  const payload = createPayload(method, path, headers[AUTH_TIMESTAMP_HEADER], headers[AUTH_METADATA_HEADER])
  const ownerAddress = await verifySign(authChain, payload, options)

  return {
    auth: ownerAddress,
    authMetadata: metadata
  }
}
