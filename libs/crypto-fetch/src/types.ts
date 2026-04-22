import type { AuthIdentity } from '@dcl/crypto'

export { AuthIdentity }
export type Metadata = Record<string, any>
export type SignedRequestInfo = string | URL | Request
export type SignedRequestInit = RequestInit & {
  identity?: AuthIdentity
  metadata?: Metadata
}
