# @dcl/content-validator

## 7.2.0

### Minor Changes

- 158d0e4: Drop the `sharp` dependency. The library only needs the format and pixel
  dimensions of thumbnails, which is now handled by a small in-house PNG/JPEG
  header reader. Removes the libvips system requirement (and its CI install
  step), the multi-MB native binary, and the cross-platform PNG-encoding
  flakiness it caused.
- 3933b03: Migrate `@dcl/content-validator` from the standalone `content-validator` repository into the `core-libs` monorepo. The package now consumes `@dcl/hashing` and `@dcl/urn-resolver` via workspace references. Tests were aligned with the shared Decentraland testing conventions and additional coverage was added for previously untested branches.
