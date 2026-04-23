import type { IFetchComponent } from '@well-known-components/interfaces'
import {
  AUTH_CHAIN_HEADER_PREFIX as _AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER as _AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER as _AUTH_TIMESTAMP_HEADER
} from '@dcl/crypto'
import RequestError from './errors'

/** @deprecated Import from `@dcl/crypto` directly. Kept here for backwards compatibility. */
export const AUTH_CHAIN_HEADER_PREFIX = _AUTH_CHAIN_HEADER_PREFIX
/** @deprecated Import from `@dcl/crypto` directly. Kept here for backwards compatibility. */
export const AUTH_METADATA_HEADER = _AUTH_METADATA_HEADER
/** @deprecated Import from `@dcl/crypto` directly. Kept here for backwards compatibility. */
export const AUTH_TIMESTAMP_HEADER = _AUTH_TIMESTAMP_HEADER

export const DEFAULT_CATALYST = 'https://peer.decentraland.org'
export const DEFAULT_EXPIRATION = 1000 * 60
export const DEFAULT_MAX_CHAIN_LENGTH = 10
export const DEFAULT_ERROR_FORMAT = (err: Error): { ok: false; message: string } => {
  const statusCode = err instanceof RequestError ? err.statusCode : 500
  // 5xx responses hide the internal message to avoid echoing backend detail
  // (catalyst hostnames, upstream errors) to clients. Consumers that need
  // the full message can provide their own `onError` formatter.
  if (statusCode >= 500) {
    return { ok: false, message: 'Internal error' }
  }
  return { ok: false, message: err.message }
}

export interface DecentralandSignatureData<P extends Record<string, unknown> = Record<string, unknown>> {
  auth: string
  authMetadata: P
}

export interface DecentralandSignatureContext<P extends Record<string, unknown> = Record<string, unknown>> {
  verification?: DecentralandSignatureData<P>
}

export interface DecentralandSignatureRequiredContext<P extends Record<string, unknown> = Record<string, unknown>> {
  verification: DecentralandSignatureData<P>
}

export interface VerifyAuthChainHeadersOptions<P extends Record<string, unknown> = Record<string, unknown>> {
  catalyst?: string
  expiration?: number
  fetcher?: IFetchComponent
  maxChainLength?: number
  metadataValidator?: (metadata: P) => boolean
}

export interface SessionOptions {
  optional?: boolean
  onError?: (err: Error) => unknown
}

export type Options<P extends Record<string, unknown> = Record<string, unknown>> = VerifyAuthChainHeadersOptions<P> &
  SessionOptions
