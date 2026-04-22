import { IFetchComponent } from '@well-known-components/interfaces'
import RequestError from './errors'

export const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
export const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
export const AUTH_METADATA_HEADER = 'x-identity-metadata'

export const DEFAULT_CATALYST = 'https://peer.decentraland.org'
export const DEFAULT_EXPIRATION = 1000 * 60
export const DEFAULT_MAX_CHAIN_LENGTH = 10
export const DEFAULT_ERROR_FORMAT = (err: Error) => {
  const statusCode = err instanceof RequestError ? err.statusCode : 500
  // 5xx responses hide the internal message to avoid echoing backend detail
  // (catalyst hostnames, upstream errors) to clients. Consumers that need
  // the full message can provide their own `onError` formatter.
  if (statusCode >= 500) {
    return { ok: false, message: 'Internal error' }
  }
  return { ok: false, message: err.message }
}

export type DecentralandSignatureData<P extends Record<string, any> = Record<string, any>> = {
  auth: string
  authMetadata: P
}

export type DecentralandSignatureContext<P extends Record<string, any> = Record<string, any>> = {
  verification?: DecentralandSignatureData<P>
}

export type DecentralandSignatureRequiredContext<P extends Record<string, any> = Record<string, any>> = {
  verification: DecentralandSignatureData<P>
}

export type VerifyAuthChainHeadersOptions<P extends Record<string, any> = Record<string, any>> = {
  catalyst?: string
  expiration?: number
  fetcher?: IFetchComponent
  maxChainLength?: number
  metadataValidator?: (metadata: P) => boolean
}

export type SessionOptions = {
  optional?: boolean
  onError?: (err: Error) => any
}

export type Options<P extends Record<string, any> = Record<string, any>> = VerifyAuthChainHeadersOptions<P> &
  SessionOptions
