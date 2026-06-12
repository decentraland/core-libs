# @dcl/crypto-middleware

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
