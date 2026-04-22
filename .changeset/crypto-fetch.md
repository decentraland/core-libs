---
"decentraland-crypto-fetch": major
---

Migrate `decentraland-crypto-fetch` into the `core-libs` monorepo. Drops the `core-js-pure` global-this polyfill (Node 22+ provides `globalThis`, `fetch`, `Headers`, `Request` and `URL` natively) and the `bin/fetch.ts` CLI. The public API (`signedFetchFactory`, `signedHeaderFactory`, default signed fetch, `SignedRequestInit`, `SignedRequestInfo`, `Metadata`, `AuthIdentity`) is preserved.
