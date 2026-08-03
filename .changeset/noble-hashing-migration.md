---
'@dcl/crypto': major
'@dcl/hashing': major
---

Replace `ethereum-cryptography` with `@noble/curves` and `@noble/hashes` v2

`ethereum-cryptography` was a thin re-export of the noble packages, so it has been
dropped in favour of depending on them directly.

- `@dcl/crypto` now uses `@noble/curves/secp256k1.js` for signing and public-key
  recovery, and `@noble/hashes/sha3.js` (`keccak_256`) for message hashing. The
  keccak hashing previously taken from `eth-connect`'s `sha3()` also moved to noble.
- `@dcl/hashing` now uses `@noble/hashes/sha2.js` and `@noble/hashes/sha3.js`.

Signature, address, and content-hash outputs are unchanged — the existing
known-answer test vectors and the production auth-chain fixtures still pass.

Note for anyone porting other code to noble v2: `secp256k1.sign()` now hashes its
input with sha256 by default (`prehash: true`). Callers that pass an already-computed
hash must pass `{ prehash: false }`, and `sign()` returns bytes rather than a
signature object.

The noble v2 packages are ESM-only, which is why `engines.node` moved to `>=24`
(Node's `require(esm)` support landed in 22.12).
