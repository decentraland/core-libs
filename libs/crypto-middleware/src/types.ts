import { IFetchComponent } from '@well-known-components/interfaces'

export const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
export const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
export const AUTH_METADATA_HEADER = 'x-identity-metadata'

export const DEFAULT_CATALYST = 'https://peer.decentraland.org'
export const DEFAULT_EXPIRATION = 1000 * 60
export const DEFAULT_ERROR_FORMAT = (err: Error) => ({
  ok: false,
  message: err.message
})

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
  metadataValidator?: (metadata: P) => boolean
}

export type SessionOptions = {
  optional?: boolean
  onError?: (err: Error) => any
}

export type Options<P extends Record<string, any> = Record<string, any>> = VerifyAuthChainHeadersOptions<P> &
  SessionOptions
