---
'@dcl/urn-resolver': patch
---

Resume publishing from the last version released to npm (`3.6.0`, from the standalone `urn-resolver` repo). The previous monorepo entries (`1.0.1` and `1.0.2`) collided with version numbers already taken on npm in 2021, so `pnpm publish` could not overwrite them and consumers installing `@dcl/urn-resolver` continued to receive the 2021 artifact (which exposes only the four-variant `DecentralandAssetIdentifier` union and does not export the third-party / collection-item / collection-asset types) instead of the migrated source. This release consolidates the work documented under the previously-blocked `1.0.1` and `1.0.2` entries — repository migration into `core-libs`, parser route-regex compile-once optimization, O(1) collection lookup, removal of a stray `console.log`, and the README Node-engines alignment (`>=22.0.0`). Public API and behaviour match the source already in `main`.
