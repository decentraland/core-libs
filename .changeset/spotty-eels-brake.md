---
'@dcl/crypto-middleware': minor
---

Freeze `authMetadata` before handing it to `metadataValidator` and to consumers.

`verify()` already passed the validator the same object it returns, so what was checked is what the handler acts on. Freezing extends that from "same object" to "same contents": a middleware that mutated the metadata between the two would otherwise leave the authorization decision describing something the handler no longer sees — the same shape as the bugs 6.0.0 was written to close.

The freeze is deep. Services authorize on nested fields such as `realm.serverName`, so a shallow freeze would be a false assurance. Recursion is safe because the input comes from `JSON.parse` — no cycles, getters or proxies.

**Behaviour change worth checking before upgrading:** code that mutated `authMetadata` (augmenting it with derived values, deleting fields) now throws a `TypeError` in strict mode, silently no-ops otherwise. Copy before modifying: `const enriched = { ...verification.authMetadata, extra }`.
