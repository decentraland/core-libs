# @dcl/hashing

## 1.1.0

### Minor Changes

- b9c0754: Replace `ipfs-unixfs-importer` + `blockstore-core` with direct use of `@ipld/dag-pb` + `ipfs-unixfs`. `hashV1` now runs on any standards-compliant bundler (webpack ≥5, vite, esbuild, rollup, rspack, parcel) with no Node polyfills on browser-resolved code paths. The public API and CID output are unchanged — single-chunk content (≤ 262144 bytes) still returns a raw-leaf CIDv1, and multi-chunk content still produces a flat dag-pb parent bit-compatible with `{ cidVersion: 1, rawLeaves: true }`. CJS bundles deps for Node back-compat; ESM leaves them external so consumer bundlers pick browser-safe variants. CJS `index.js` drops ~46% (206 KB → 112 KB).

  Behavioral note: content exceeding the flat-parent limit of 174 chunks (~43.5 MB) now throws `hashV1: content exceeds flat-parent limit`. Decentraland scene/wearable content does not approach that; a balanced-tree layout can be added later if needed.

- d9325a1: Migrate the hashing package into core-libs.

### Patch Changes

- 35956d0: `hashV1` now short-circuits the ipfs-unixfs-importer pipeline for `Uint8Array` inputs at or below the default chunk size (262144 bytes), computing the raw-leaf CIDv1 directly via sha256. Larger buffers and streams still flow through the importer. The resulting CID is byte-for-byte identical to what the importer produces with `rawLeaves: true` for single-chunk content, so the public API and output are unchanged. The `TextEncoder` used by `prepareADR32Data` is also hoisted to module scope.
