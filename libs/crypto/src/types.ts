export type Signature = string
export type EthAddress = string

import { AuthChain, AuthLink, AuthLinkType } from '@dcl/schemas'
export { AuthChain, AuthLinkType, AuthLink }

export interface IdentityType {
  privateKey: string
  publicKey: string
  address: string
}

export interface AuthIdentity {
  ephemeralIdentity: IdentityType
  expiration: Date
  authChain: AuthChain
}

export interface ValidationResult {
  /** Signature/identity validity only; request authorization must also check the operation. */
  ok: boolean
  message?: string
  /** Present when the chain is a scoped login (ADR-162): what the final key may do for the verifier's service. */
  scope?: ScopedLoginScope
}

/** One `Allow` line of a scoped login. */
export interface ScopedLoginGrant {
  service: string
  /** An operation of the service, or `*` for all of them. */
  operation: string
  /** Limits the grant to this resource; absent means every resource. */
  resource?: string
}

/** What a scoped login allows for one service. */
export interface ScopedLoginScope {
  service: string
  /** Effective chain expiration in Unix millis: the earliest expiration of all delegation links. */
  expiration: number
  /** The grants for `service` only. */
  grants: ScopedLoginGrant[]
}

export interface ScopedLoginValidationOptions {
  /**
   * Identifier of the service validating the chain. Without it, a chain with a scoped link is
   * rejected; with it, it is accepted only when it grants something to this service.
   */
  service?: string
  /** Maximum remaining chain validity. Default: 24 hours; a positive override is explicit service policy. */
  maxScopedLoginLifetimeInMillis?: number
}

/** An action being authorized, resolved by the verifier rather than supplied by the signing key. */
export interface ScopedRequestAuthorizationOptions extends ScopedLoginValidationOptions {
  service: string
  operation: string
  resource?: string
}

/** Authorization result with the exact resolved action values; handlers must use this resource. */
export interface RequestAuthorizationResult extends ValidationResult {
  readonly operation?: string
  readonly resource?: string
}
