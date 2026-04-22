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
  ok: boolean
  message?: string
}
