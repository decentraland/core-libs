---
"@dcl/hashing": patch
---

`hashV1` now short-circuits the ipfs-unixfs-importer pipeline for `Uint8Array` inputs at or below the default chunk size (262144 bytes), computing the raw-leaf CIDv1 directly via sha256. Larger buffers and streams still flow through the importer. The resulting CID is byte-for-byte identical to what the importer produces with `rawLeaves: true` for single-chunk content, so the public API and output are unchanged. The `TextEncoder` used by `prepareADR32Data` is also hoisted to module scope.
