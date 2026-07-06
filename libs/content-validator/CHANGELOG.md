# @dcl/content-validator

## 7.3.3

### Patch Changes

- 5bca4b7: feat: make deployment size-fetch concurrency configurable via `ExternalCalls.fetchContentFileSizeConcurrency`

  `calculateDeploymentSize` awaited `externalCalls.fetchContentFileSize` one hash at a time, so validating a deployment whose content isn't in the uploaded files (e.g. a synced multi-file scene) performed N sequential storage round-trips. `ExternalCalls` now accepts an optional `fetchContentFileSizeConcurrency`: it **defaults to 1 (sequential — unchanged behavior)** and, when set higher, fetches the not-yet-uploaded sizes in bounded concurrent batches. The batching means even a large content list can't fan out into an unbounded number of concurrent storage operations. Total size and the "Couldn't fetch content file with hash" error are unchanged.

## 7.3.2

### Patch Changes

- ef92819: performance: the profile-images validation no longer re-scans every uploaded file's hash once per avatar (it was O(avatars × files)). The per-avatar requirement (each avatar must declare face/body thumbnail hashes) still runs in the avatar loop; the file-hash comparison now runs once. The pass/fail outcome is unchanged — a mismatched file is now reported a single time instead of once per avatar.

## 7.3.1

### Patch Changes

- Updated dependencies [e219eca]
- Updated dependencies [ce586e5]
  - @dcl/hashing@1.2.0
  - @dcl/urn-resolver@3.6.1

## 7.3.0

### Minor Changes

- f4df4d4: feat: add spring bones metadata validation

### Patch Changes

- bc65d55: Documentation-only updates to the published READMEs:

  - `@dcl/content-validator`: fix on-chain and subgraph access-checker examples to use the actual subpath imports under `dist/validations/access/...` (the referenced symbols are not re-exported from the package root).
  - `@dcl/http-commons`: add a README covering errors, middlewares (`errorHandler`, `bearerTokenMiddleware`, `ethAddressNormalizerMiddleware`), and utilities (`getPaginationParams`, `parseJson`, `generateRandomWalletAddress[es]`); add a missing `engines.node >=22.0.0` field to `package.json` for consistency with sibling packages.
  - `@dcl/urn-resolver`: align the documented Node prerequisite with `package.json` engines (`>=22.0.0`).

- Updated dependencies [bc65d55]
  - @dcl/urn-resolver@1.0.2

## 7.2.0

### Minor Changes

- 158d0e4: Drop the `sharp` dependency. The library only needs the format and pixel
  dimensions of thumbnails, which is now handled by a small in-house PNG/JPEG
  header reader. Removes the libvips system requirement (and its CI install
  step), the multi-MB native binary, and the cross-platform PNG-encoding
  flakiness it caused.
- 3933b03: Migrate `@dcl/content-validator` from the standalone `content-validator` repository into the `core-libs` monorepo. The package now consumes `@dcl/hashing` and `@dcl/urn-resolver` via workspace references. Tests were aligned with the shared Decentraland testing conventions and additional coverage was added for previously untested branches.
