---
"@dcl/crypto-middleware": patch
---

document that `authMetadata` (and the request method/path) are authenticated case-insensitively only. The canonical Decentraland signed-fetch payload is lowercased before signing, so the signature does not bind the exact byte-casing of the metadata header — an intermediary can alter the case of `authMetadata` without invalidating the signature. Added a JSDoc warning on `DecentralandSignatureData.authMetadata` and on `createPayload` so consumers do not make case-sensitive security decisions on these values. No behavior change; the README already described this protocol property.
