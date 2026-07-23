# @dcl/content-validator

## 7.4.2

### Patch Changes

- 27ac047: Enforce content/pointer binding for third-party items and move the outfits pointer-ownership check into the access layer.

  - Third-party emotes are now bound to their approved Merkle leaf. An approved third-party wearable's proof can no longer be reused to deploy an emote at the wearable's official pointer: `thirdPartyEmoteMerkleProofContentValidateFn` checks that the metadata `id` matches the pointer, that the uploaded files match the committed `content` map, and that the proof commits `emoteDataADR74`.
  - Third-party wearable and emote bindings now require `id`, `content` (and `data`/`emoteDataADR74` respectively) to be present in `merkleProof.hashingKeys`, so those fields are actually committed by the leaf instead of being trusted from attacker-supplied metadata.
  - The outfits access validator now also verifies that the deployment pointer (`<address>:outfits`) belongs to the signer, matching the profile and store access checks. This is a consistency change, not a fix for a live gap: the same check already runs at deploy time in the stateless validation pipeline (which `createValidator` executes before the access check), so outfits pointers were never hijackable. It only makes the access checker correct on its own.

## 7.4.1

### Patch Changes

- 9aaee98: Require a scene's `display.navmapThumbnail` to be a relative path to an embedded content file. `embeddedThumbnail` now rejects, before the existing embedded-file check, any value that is not a plain relative path: values carrying a URI scheme (`https:`, `data:`, `javascript:`, …), protocol-relative (`//host/…`) or root-absolute (`/x`) paths, values with leading/trailing whitespace or control characters, and values containing the HTML-breakout characters `<`, `>` or `"`.

  Previously the validation only required an exact match against a declared `content[].file`, so an absolute URL carrying breakout characters was accepted as long as the same string was also declared as a content mapping. Downstream consumers that keep `https://`-prefixed thumbnails verbatim (e.g. the Places social/OpenGraph endpoint) then interpolated the value into HTML, turning the filename into stored XSS. Constraining the field at the deployment gate stops the payload from ever being accepted.

  This is backward-compatible: a legitimate absolute-URL thumbnail already failed the embedded-file check, so only the attack construction changes outcome.

## 7.4.0

### Minor Changes

- ff249d0: Add `createStagingValidator` and `createStagingValidateFns` for composing the partial-deployment (staging) validation subset — the content-independent validations that can be checked before all of an entity's content is present — without importing individual validations from `dist/`.

  `createStagingValidateFns(components)` returns the staging subset (entity structure, IPFS hashing, metadata schema, ADR-45, signature, scene rules, and the "no unreferenced files" check), deliberately excluding the size validation, content completeness, and non-scene type validations. It is scene-only: a non-scene entity is rejected up front rather than silently accepted after skipping its type-specific checks. `createStagingValidator(components, options?: StagingValidatorOptions)` composes them into a ready validator and appends the access check only when `includeAccessCheck` is set (it is the expensive on-chain/subgraph call and may be skipped on a trusted resume request; the full `createValidator` still runs it at finalize). Its failures log under `ContentValidator:staging` so they are distinguishable from the full validator's.

  This lets multi-request upload flows validate staging requests through the library's public API instead of deep-importing individual `dist/validations/*` functions.

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
