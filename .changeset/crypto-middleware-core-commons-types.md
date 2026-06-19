---
"@dcl/crypto-middleware": major
---

Type the `wellKnownComponents` middleware and the `fetcher` option against `@dcl/core-commons` instead of `@well-known-components/interfaces`.

The runtime already targeted `@dcl/http-server` v2 (native/undici `Headers` via `.entries()`), but the static types still bound the request context and `fetcher` to `node-fetch`'s `Request`/`IFetchComponent`. That mismatch forced consumers pairing this with `@dcl/http-server` to bridge with `as unknown as` casts. The handler context and `fetcher` now use the native (undici) types from `@dcl/core-commons`, so no casts are needed. `@dcl/core-commons` replaces the direct `@well-known-components/interfaces` dependency.

BREAKING CHANGE: `wellKnownComponents` and `VerifyAuthChainHeadersOptions['fetcher']` are now typed against `@dcl/core-commons` (native `Request`/`IFetchComponent`) rather than `@well-known-components/interfaces` (node-fetch). Consumers still pairing this with a `node-fetch`-typed HTTP server / fetch component will see type errors. Mirrors the same change made to `@dcl/http-commons`.
