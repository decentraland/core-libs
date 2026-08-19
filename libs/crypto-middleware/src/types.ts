import type { IFetchComponent } from '@dcl/core-commons'
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
  /**
   * Metadata property names this service authorizes on, in their canonical spelling. Dotted paths
   * address nested fields, e.g. `'realm.serverName'`.
   *
   * Declaring them opts the service into verifying requests still signed with the pre-6.0.0
   * payload, for the window in which its callers have not shipped the new one. Only for services
   * whose callers cannot be sequenced ahead of them — an explorer fleet, say, where a client
   * release cannot be deployed atomically with a service. Everywhere else, leave this absent and
   * let the callers ship first.
   *
   * The legacy payload folds the metadata, so its casing falls outside the signature and a
   * delivered key differing only in case would keep a valid signature while reading as absent. A
   * legacy request whose keys do not match these spellings exactly is refused. Requests signed with
   * the current format never consult this.
   *
   * The list doubles as the switch deliberately: there is no way to accept the legacy payload
   * without naming the fields that make it safe to do so.
   *
   * Property *values* are not covered here — compose `rejectIfSigner`, `requireSigner` or
   * `requireCanonicalField` into `metadataValidator`, which runs before signature verification and
   * therefore guards both paths.
   */
  canonicalMetadataKeys?: string[]
}

export interface SessionOptions {
  optional?: boolean
  onError?: (err: Error) => unknown
}

export type Options<P extends Record<string, unknown> = Record<string, unknown>> = VerifyAuthChainHeadersOptions<P> &
  SessionOptions
