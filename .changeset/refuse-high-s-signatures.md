---
'@dcl/crypto': minor
---

Refuse ECDSA signatures whose `s` value is in the upper half of the curve order (EIP-2).

Every secp256k1 signature has a second valid encoding with `s` replaced by `n - s`. Signature recovery now accepts only the canonical low-s form, so personal-signature links (`SIGNER` delegations, scoped delegations and signed entities) validated by `validateSignature` fail when they carry a high-s signature. Signatures with `r` or `s` equal to zero or not below the curve order were already refused and still are.

Wallets and `ethSign`/`createSignature` produce low-s signatures, so chains they build are unaffected.
