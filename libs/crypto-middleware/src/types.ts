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

/**
 * Opt-in acceptance of the pre-6.0.0 signed-payload format, for the migration window in which
 * clients that fold the whole payload have not yet shipped the new one.
 *
 * Only for services whose callers cannot be sequenced ahead of them — an explorer fleet, say, where
 * a client release cannot be deployed atomically with a service. Everywhere else the callers should
 * ship first and this option should stay absent.
 */
export interface LegacyPayloadOptions {
  /**
   * Metadata property names this service authorizes on, in their canonical spelling. Dotted paths
   * address nested fields, e.g. `'realm.serverName'`.
   *
   * The legacy payload folds the metadata, so its casing is outside the signature and a delivered
   * key differing only in case would keep a valid signature while reading as absent. A legacy
   * request whose keys do not match these spellings exactly is refused.
   *
   * Required, and refusing an empty list is deliberate: without it the option would silently accept
   * unbound metadata, which is the bypass 6.0.0 exists to close.
   *
   * Property *values* are not covered here — compose `rejectIfSigner`, `requireSigner` or
   * `requireCanonicalField` into `metadataValidator`, which runs before signature verification and
   * therefore guards both the current and the legacy path.
   */
  canonicalMetadataKeys: string[]

  /** Called when a request is accepted through the legacy format. Use it to know when to remove this. */
  onAccepted?: (info: { method: string; path: string }) => void
}

export interface VerifyAuthChainHeadersOptions<P extends Record<string, unknown> = Record<string, unknown>> {
  catalyst?: string
  expiration?: number
  fetcher?: IFetchComponent
  maxChainLength?: number
  metadataValidator?: (metadata: P) => boolean
  /** Absent by default. See {@link LegacyPayloadOptions} before enabling. */
  acceptLegacyPayload?: LegacyPayloadOptions
}

export interface SessionOptions {
  optional?: boolean
  onError?: (err: Error) => unknown
}

export type Options<P extends Record<string, unknown> = Record<string, unknown>> = VerifyAuthChainHeadersOptions<P> &
  SessionOptions
