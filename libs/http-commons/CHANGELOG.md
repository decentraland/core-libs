# @dcl/http-commons

## 2.0.0

### Major Changes

- 7e5a4a4: Type the HTTP handlers/middleware against `@dcl/core-commons`' native-fetch `IHttpServerComponent` instead of `@well-known-components/interfaces`, so they can be used with `@dcl/http-server` v2 without casts. `HTTPResponseError` now wraps the native (undici) `Response`, and the `node-fetch` dependency is dropped.

  BREAKING CHANGE: consumers must run the native-fetch HTTP server (`@dcl/http-server` v2 / `@dcl/core-commons`). Services still on the node-fetch-based `@well-known-components/http-server` should stay on `@dcl/http-commons@1.x`.

## 1.0.2

### Patch Changes

- bc65d55: Documentation-only updates to the published READMEs:

  - `@dcl/content-validator`: fix on-chain and subgraph access-checker examples to use the actual subpath imports under `dist/validations/access/...` (the referenced symbols are not re-exported from the package root).
  - `@dcl/http-commons`: add a README covering errors, middlewares (`errorHandler`, `bearerTokenMiddleware`, `ethAddressNormalizerMiddleware`), and utilities (`getPaginationParams`, `parseJson`, `generateRandomWalletAddress[es]`); add a missing `engines.node >=22.0.0` field to `package.json` for consistency with sibling packages.
  - `@dcl/urn-resolver`: align the documented Node prerequisite with `package.json` engines (`>=22.0.0`).

## 1.0.1

### Patch Changes

- f7eaff8: Use constant-time comparison for bearer token validation to prevent theoretical timing side-channels
- 504f5a4: Wire up `@dcl/eslint-config/core-services` across all libs and address every error it surfaced. Replaces `any` with precise types or `unknown` (e.g. `Metadata`, `Record<string, any>` → `Record<string, unknown>`, options bag types), drops forbidden non-null assertions in `@dcl/crypto`'s `Blocks` helper and EIP-1654 validators, converts the `Authenticator` namespace to a const-object (preserves the existing `import { Authenticator }` consumer surface), and adds explicit return types to public functions. Public runtime behavior is unchanged; some public type signatures are narrowed (e.g. `Record<string, any>` → `Record<string, unknown>`) which may require minor adjustments in strict downstream TypeScript code.

## 1.0.0

### Major Changes

- fa6e53b: Expose middlewares and utils handling input and responses parsing
