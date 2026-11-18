---
'@dcl/crypto-middleware': minor
---

Require the `x-identity-timestamp` header to be plain decimal digits.

`verifyTimestamp` parsed the header with `Number()`, which also accepts decimals, exponents, hex and binary literals, a leading sign and surrounding whitespace. Any of these now fails with the existing `400 Invalid chain timestamp` error, as does a digit string beyond `Number.MAX_SAFE_INTEGER`. Signers that send `String(Date.now())`, as `decentraland-crypto-fetch` does, are unaffected. An absent or empty header still reads as `0` and is rejected as expired.
