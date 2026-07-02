---
"@dcl/single-sign-on-client": patch
---

`getIdentity` no longer throws or returns a malformed identity when the stored value is valid JSON but not a well-formed identity. Previously a stored `null`, number, string, or boolean caused a `TypeError` (the code assigned `.expiration` on a non-object), and a stored `{}` was returned as a "valid" identity with an Invalid Date expiration. The parsed value is now shape-validated (must be an object with `ephemeralIdentity`, `authChain`, and a parseable `expiration`); anything else is cleared from storage and `getIdentity` returns `null`.
