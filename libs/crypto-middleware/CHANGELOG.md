# @dcl/crypto-middleware

## 4.1.0

### Minor Changes

- 1a9fc13: Accept an explicit `null` metadata header by treating it as empty metadata (`{}`) instead of rejecting the request with a 400.

  This restores compatibility with clients built against `@dcl/platform-crypto-middleware`, which returned `null` as-is. `authMetadata` is still guaranteed to be a safe object to dereference, and non-object metadata (primitives, arrays) continues to be rejected with a 400.

## 4.0.0

### Major Changes

- 1603d0b: Remove the Passport strategy adapter.

  The `passport()` factory and the `DecentralandStrategy` class are no longer exported, and the optional `passport-strategy` peer dependency has been dropped. The Express, Koa, and Well-Known Components adapters remain unchanged.

  BREAKING CHANGE: `passport()` and `DecentralandStrategy` are no longer part of the public API. Consumers using the Passport adapter should switch to the `express`, `koa`, or `wellKnownComponents` middleware.

## 3.0.0

### Major Changes

- d79a570: Type the `wellKnownComponents` middleware and the `fetcher` option against `@dcl/core-commons` instead of `@well-known-components/interfaces`.

  The runtime already targeted `@dcl/http-server` v2 (native/undici `Headers` via `.entries()`), but the static types still bound the request context and `fetcher` to `node-fetch`'s `Request`/`IFetchComponent`. That mismatch forced consumers pairing this with `@dcl/http-server` to bridge with `as unknown as` casts. The handler context and `fetcher` now use the native (undici) types from `@dcl/core-commons`, so no casts are needed. `@dcl/core-commons` replaces the direct `@well-known-components/interfaces` dependency.

  BREAKING CHANGE: `wellKnownComponents` and `VerifyAuthChainHeadersOptions['fetcher']` are now typed against `@dcl/core-commons` (native `Request`/`IFetchComponent`) rather than `@well-known-components/interfaces` (node-fetch). Consumers still pairing this with a `node-fetch`-typed HTTP server / fetch component will see type errors. Mirrors the same change made to `@dcl/http-commons`.

## 2.0.1

### Patch Changes

- 79eae87: Make the `wellKnownComponents` adapter work with the native-fetch HTTP server. It read auth headers via the node-fetch-only `Headers.raw()`, which throws on the native (undici) `Headers` used by `@dcl/http-server` v2. It now builds the plain header map with `Headers.entries()`, which works on both node-fetch and native `Headers` (single-valued auth headers are unaffected, as `verify()` normalizes each value).

## 2.0.0

### Major Changes

- e2b45a0: Initial release of `@dcl/crypto-middleware`, a consolidation of `decentraland-crypto-middleware` and `@dcl/platform-crypto-middleware`. Exposes Express, Koa, Passport, and Well-Known Components adapters; uses the Node 22+ global `fetch` with an optional `IFetchComponent` injection; validates the catalyst response shape; runs expiration checks before contacting the catalyst.

### Minor Changes

- 504f5a4: Wire up `@dcl/eslint-config/core-services` across all libs and address every error it surfaced. Replaces `any` with precise types or `unknown` (e.g. `Metadata`, `Record<string, any>` → `Record<string, unknown>`, options bag types), drops forbidden non-null assertions in `@dcl/crypto`'s `Blocks` helper and EIP-1654 validators, converts the `Authenticator` namespace to a const-object (preserves the existing `import { Authenticator }` consumer surface), and adds explicit return types to public functions. Public runtime behavior is unchanged; some public type signatures are narrowed (e.g. `Record<string, any>` → `Record<string, unknown>`) which may require minor adjustments in strict downstream TypeScript code.

### Patch Changes

- 7b6f53e: Migrate `@dcl/crypto` from the standalone `decentraland-crypto` repository into the `core-libs` monorepo. The package source, tests and public API are unchanged — downstream consumers should see no behavioural differences. `@dcl/crypto-middleware` now consumes `@dcl/crypto` as an internal workspace dependency.
- Updated dependencies [7b6f53e]
- Updated dependencies [504f5a4]
- Updated dependencies [504f5a4]
  - @dcl/crypto@3.7.0
