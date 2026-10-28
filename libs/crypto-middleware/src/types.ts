import type { IFetchComponent, IHttpServerComponent } from '@dcl/core-commons'
import {
  AUTH_CHAIN_HEADER_PREFIX as _AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER as _AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER as _AUTH_TIMESTAMP_HEADER
} from '@dcl/crypto'
import type { ScopedLoginScope } from '@dcl/crypto'
import RequestError from './errors'
import type { AuthChainProvider } from './rpc-provider'

/** @deprecated Import from `@dcl/crypto` directly. Kept here for backwards compatibility. */
export const AUTH_CHAIN_HEADER_PREFIX = _AUTH_CHAIN_HEADER_PREFIX
/** @deprecated Import from `@dcl/crypto` directly. Kept here for backwards compatibility. */
export const AUTH_METADATA_HEADER = _AUTH_METADATA_HEADER
/** @deprecated Import from `@dcl/crypto` directly. Kept here for backwards compatibility. */
export const AUTH_TIMESTAMP_HEADER = _AUTH_TIMESTAMP_HEADER

export const DEFAULT_CATALYST = 'https://peer.decentraland.org'
export const DEFAULT_EXPIRATION = 1000 * 60
export const DEFAULT_MAX_CHAIN_LENGTH = 10
export const DEFAULT_ERROR_FORMAT = (err: Error): { ok: false; message: string; code?: string } => {
  const statusCode = err instanceof RequestError ? err.statusCode : 500
  // 5xx responses hide the internal message to avoid echoing backend detail
  // (catalyst hostnames, upstream errors) to clients. Consumers that need
  // the full message can provide their own `onError` formatter.
  if (statusCode >= 500) {
    return { ok: false, message: 'Internal error' }
  }
  return { ok: false, message: err.message, ...(err instanceof RequestError && err.code ? { code: err.code } : {}) }
}

export interface DecentralandSignatureData<P extends Record<string, unknown> = Record<string, unknown>> {
  auth: string
  authMetadata: P
  /**
   * Set when the request was signed with a scoped login (ADR-162): the operations it may perform on
   * this service. Absent for a full login, which may perform every operation. The middleware has
   * already checked the request's `operation` against it. Low-level identity validators alone do not authorize actions.
   */
  scope?: ScopedLoginScope
  /** Canonical resource resolved once and authorized by the verifier. Handlers MUST act on this value. */
  readonly resource?: string
}

export interface DecentralandSignatureContext<P extends Record<string, unknown> = Record<string, unknown>> {
  verification?: DecentralandSignatureData<P>
}

export interface DecentralandSignatureRequiredContext<P extends Record<string, unknown> = Record<string, unknown>> {
  verification: DecentralandSignatureData<P>
}

export interface SignatureVerificationOptions<P extends Record<string, unknown> = Record<string, unknown>> {
  /** Validates signatures directly on the configured chain instead of consulting Catalyst. */
  provider?: AuthChainProvider
  catalyst?: string
  expiration?: number
  fetcher?: IFetchComponent
  maxChainLength?: number
  /** With a provider: RPC calls one validation may make before it is rejected. Default: 16. */
  maxRpcCalls?: number
  metadataValidator?: (metadata: P) => boolean
  /**
   * Identifier of this service (e.g. `insights`), which opts it into scoped logins (ADR-162).
   * Without it, scoped signatures are rejected. Request APIs must additionally authorize an operation.
   * Contract-wallet scoped logins require `provider`; the catalyst does not validate them.
   */
  service?: string
  /** With `service`: maximum remaining chain validity in milliseconds (default 24 hours). */
  maxScopedLoginLifetime?: number
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

/** Signed requests opting into scoped credentials must declare their action at runtime. */
export interface VerifyAuthChainHeadersOptions<
  P extends Record<string, unknown> = Record<string, unknown>
> extends SignatureVerificationOptions<P> {
  /** Required for scoped requests. Missing operations are rejected with SCOPED_OPERATION_REQUIRED. */
  operation?: string
  /** Canonical resource the request acts on. */
  resource?: string
}

/** Opt-in type for callers that also want service/action requirements checked by TypeScript. */
export type ScopedVerifyOptions<P extends Record<string, unknown> = Record<string, unknown>> =
  VerifyAuthChainHeadersOptions<P> & { service: string; operation: string }

export interface SessionOptions {
  optional?: boolean
  onError?: (err: Error) => unknown
}

export type DecentralandSignatureRouteContext<P extends Record<string, unknown> = Record<string, unknown>> =
  IHttpServerComponent.DefaultContext<IHttpServerComponent.PathAwareContext<DecentralandSignatureContext<P>, string>>

export interface RouteOperationOptions<P extends Record<string, unknown> = Record<string, unknown>> {
  /**
   * With `service`: the one operation this route performs (e.g. `logs-read`), or a function choosing
   * it from the request. A request signed with a scoped login is rejected with 403 when the login
   * doesn't grant it, and with 403/SCOPED_OPERATION_REQUIRED when the route has none (absent, or the function returns
   * `undefined`), so a scoped login reaches only routes that declare what they do. A full login
   * does not need an operation grant, but configured resource resolvers must still succeed. `*` is not an operation.
   */
  operation?: string | ((ctx: DecentralandSignatureRouteContext<P>) => string | undefined)
  /** With `operation`: the resource the request acts on, matched against grants limited to one. */
  resource?: (ctx: DecentralandSignatureRouteContext<P>) => string | undefined
}

export type Options<P extends Record<string, unknown> = Record<string, unknown>> = SignatureVerificationOptions<P> &
  SessionOptions &
  RouteOperationOptions<P>
