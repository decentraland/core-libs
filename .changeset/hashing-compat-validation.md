---
"@dcl/hashing": patch
---

compatibility and input-validation fixes (hash output is unchanged):

- `calculateMultipleHashesADR32` no longer uses the ES2023 `Array.prototype.toSorted`, which was emitted untranspiled into the browser ESM bundle and threw `TypeError: toSorted is not a function` on pre-2023 runtimes (Safari < 16, Node < 20). It now sorts a copy of the array.
- `hashV1WithLayout` now validates its layout options, throwing on `chunkSize < 1` / non-integer `chunkSize` (previously an infinite loop) and `maxChildrenPerNode < 2` / non-integer (previously infinite recursion).
- byte-content detection uses a realm-safe check instead of `instanceof Uint8Array`, so cross-realm buffers are accepted.
- documented that `keccak256Hash` is sensitive to key/property ordering.
