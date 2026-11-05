---
"@dcl/crypto": minor
---

Add `createAuthChainHeaders(authChain, timestamp, metadata?)` to serialize a signed `AuthChain` into the `x-identity-*` signed-fetch headers (`AUTH_CHAIN_HEADER_PREFIX{i}`, `AUTH_TIMESTAMP_HEADER`, `AUTH_METADATA_HEADER`). This is serialization only — signing still happens via `Authenticator.signPayload` — and centralizes logic that was duplicated in `@dcl/crypto-middleware`'s `createAuthChainHeaders` and in `@dcl/pulse-client`'s `buildAuthChain`. Purely additive; no existing exports change.
