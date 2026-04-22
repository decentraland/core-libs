// Decentraland signed-fetch HTTP header names. Centralized here so that signing
// libraries (decentraland-crypto-fetch) and verifying libraries (@dcl/crypto-middleware)
// always agree on the wire protocol — drift here silently breaks authentication.

export const AUTH_CHAIN_HEADER_PREFIX = 'x-identity-auth-chain-'
export const AUTH_TIMESTAMP_HEADER = 'x-identity-timestamp'
export const AUTH_METADATA_HEADER = 'x-identity-metadata'
