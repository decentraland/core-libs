# @dcl/crypto

## 3.7.0

### Minor Changes

- 504f5a4: Add `AUTH_CHAIN_HEADER_PREFIX`, `AUTH_TIMESTAMP_HEADER` and `AUTH_METADATA_HEADER` to `@dcl/crypto`'s public surface (new `headers` export). Centralizes the Decentraland signed-fetch wire-protocol header names so signing libraries (`decentraland-crypto-fetch`) and verifying libraries (`@dcl/crypto-middleware`) always agree. `@dcl/crypto-middleware` keeps re-exporting these names for backwards compatibility.

### Patch Changes

- 7b6f53e: Migrate `@dcl/crypto` from the standalone `decentraland-crypto` repository into the `core-libs` monorepo. The package source, tests and public API are unchanged — downstream consumers should see no behavioural differences. `@dcl/crypto-middleware` now consumes `@dcl/crypto` as an internal workspace dependency.
- 504f5a4: Wire up `@dcl/eslint-config/core-services` across all libs and address every error it surfaced. Replaces `any` with precise types or `unknown` (e.g. `Metadata`, `Record<string, any>` → `Record<string, unknown>`, options bag types), drops forbidden non-null assertions in `@dcl/crypto`'s `Blocks` helper and EIP-1654 validators, converts the `Authenticator` namespace to a const-object (preserves the existing `import { Authenticator }` consumer surface), and adds explicit return types to public functions. Public runtime behavior is unchanged; some public type signatures are narrowed (e.g. `Record<string, any>` → `Record<string, unknown>`) which may require minor adjustments in strict downstream TypeScript code.
