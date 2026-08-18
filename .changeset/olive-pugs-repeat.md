---
'decentraland-crypto-fetch': major
---

Match the signed payload format to `@dcl/crypto-middleware` 6.

`signedHeaderFactory` now lowercases only the method, path and timestamp and joins the metadata verbatim, instead of lowercasing the whole payload. Metadata casing is therefore covered by the signature: the property names and values that arrive are the ones that were signed, and a service reading `authMetadata` gets them case-intact.

This is the same wire-format change as `@dcl/crypto-middleware` 6 and must ship with it. A service on the previous middleware will reject headers produced by this version, and vice versa, for any request whose metadata contains an uppercase character.
