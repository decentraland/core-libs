import { AUTH_CHAIN_HEADER_PREFIX, AUTH_METADATA_HEADER, AUTH_TIMESTAMP_HEADER, Authenticator } from '@dcl/crypto'
import { getImplementation } from './utils'
import type { AuthIdentity, Metadata } from './types'

export interface SignedHeaderFactoryOptions {
  Headers?: typeof Headers
}

export type SignedHeaderBuilder = (
  identity: AuthIdentity,
  method: string,
  path: string,
  metadata: Metadata,
  init?: HeadersInit
) => Headers

export default function signedHeaderFactory(options: SignedHeaderFactoryOptions = {}): SignedHeaderBuilder {
  const HeadersImpl = getImplementation(options, 'Headers')

  return function signedHeader(
    identity: AuthIdentity,
    method: string,
    path: string,
    metadata: Metadata,
    init?: HeadersInit
  ): Headers {
    const headers = new HeadersImpl(init)
    const timestamp = String(Date.now())
    const data = JSON.stringify(metadata)
    // The signed payload is lowercased to match the canonical Decentraland signed-fetch
    // wire protocol (see `@dcl/crypto-middleware`). As a consequence the signature covers
    // method/path/metadata case-insensitively only: the verifier receives the metadata
    // header bytes as sent here, but authenticates their lowercased form. Keep this in sync
    // with the verifier — removing the lowercasing on either side breaks interoperability.
    const payload = [method, path, timestamp, data].join(':').toLowerCase()

    let i = 0
    const chain = Authenticator.signPayload(identity, payload)
    for (const link of chain) {
      headers.set(AUTH_CHAIN_HEADER_PREFIX + i, JSON.stringify(link))
      i++
    }

    headers.set(AUTH_TIMESTAMP_HEADER, timestamp)
    headers.set(AUTH_METADATA_HEADER, data)
    return headers
  }
}
