---
"@dcl/crypto": minor
"@dcl/crypto-middleware": patch
---

Migrate `@dcl/crypto` from the standalone `decentraland-crypto` repository into the `core-libs` monorepo. The package source, tests and public API are unchanged — downstream consumers should see no behavioural differences. `@dcl/crypto-middleware` now consumes `@dcl/crypto` as an internal workspace dependency.
