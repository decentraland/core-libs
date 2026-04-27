# @dcl/urn-resolver

## 1.0.2

### Patch Changes

- bc65d55: Documentation-only updates to the published READMEs:

  - `@dcl/content-validator`: fix on-chain and subgraph access-checker examples to use the actual subpath imports under `dist/validations/access/...` (the referenced symbols are not re-exported from the package root).
  - `@dcl/http-commons`: add a README covering errors, middlewares (`errorHandler`, `bearerTokenMiddleware`, `ethAddressNormalizerMiddleware`), and utilities (`getPaginationParams`, `parseJson`, `generateRandomWalletAddress[es]`); add a missing `engines.node >=22.0.0` field to `package.json` for consistency with sibling packages.
  - `@dcl/urn-resolver`: align the documented Node prerequisite with `package.json` engines (`>=22.0.0`).

## 1.0.1

### Patch Changes

- 8344098: Migrate `@dcl/urn-resolver` from the standalone `urn-resolver` repository into the `core-libs` monorepo. The package source, tests and public API are unchanged — downstream consumers should see no behavioural differences.
- 8344098: Improve parser throughput: route regexes are now compiled once at `createParser` time instead of being rebuilt on every `parseUrn` call, and `getCollection` now does an O(1) lookup against two pre-built `Map`s instead of an O(n) scan over the full collections-v1 list. A stray `console.log` in the contract lookup path is also removed. The public API and all existing behaviour are unchanged.
