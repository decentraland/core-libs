---
"@dcl/crypto": minor
---

Add `AUTH_CHAIN_HEADER_PREFIX`, `AUTH_TIMESTAMP_HEADER` and `AUTH_METADATA_HEADER` to `@dcl/crypto`'s public surface (new `headers` export). Centralizes the Decentraland signed-fetch wire-protocol header names so signing libraries (`decentraland-crypto-fetch`) and verifying libraries (`@dcl/crypto-middleware`) always agree. `@dcl/crypto-middleware` keeps re-exporting these names for backwards compatibility.
