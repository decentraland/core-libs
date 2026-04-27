---
"@dcl/hashing": minor
---

`hashV1` now supports arbitrarily large content. The previous implementation rejected inputs above 174 chunks (~43 MB) with a `flat-parent limit` error; it now builds a balanced UnixFS tree (default `maxChildrenPerNode: 174`, matching `ipfs-unixfs-importer`) on the fly so memory stays bounded by tree depth and is independent of the total file size. CIDs remain bit-compatible with `ipfs-unixfs-importer`'s balanced layout.

Also restores the pre-1.1.0 behavior for empty input: an empty async iterable now produces the empty raw-leaf CID (`bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku`) instead of throwing, matching both `ipfs-unixfs-importer` and the behavior of an empty `Uint8Array`.
