---
"@dcl/crypto-middleware": major
---

Initial release of `@dcl/crypto-middleware`, a consolidation of `decentraland-crypto-middleware` and `@dcl/platform-crypto-middleware`. Exposes Express, Koa, Passport, and Well-Known Components adapters; uses the Node 22+ global `fetch` with an optional `IFetchComponent` injection; validates the catalyst response shape; runs expiration checks before contacting the catalyst.
