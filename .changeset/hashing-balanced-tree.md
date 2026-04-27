---
"@dcl/hashing": minor
---

`hashV1` now supports arbitrarily large content. The previous implementation rejected inputs above 174 chunks (~43 MB) with a `flat-parent limit` error; it now builds a balanced UnixFS tree (default `maxChildrenPerNode: 174`, matching `ipfs-unixfs-importer`) on the fly so memory stays bounded by tree depth and is independent of the total file size. CIDs remain bit-compatible with `ipfs-unixfs-importer`'s balanced layout.
