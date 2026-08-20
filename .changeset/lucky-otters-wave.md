---
'@dcl/crypto-middleware': minor
---

Make the metadata predicates refuse a key that case-folds to the field without being spelled exactly that.

`rejectIfSigner`, `requireSigner`, `requireCanonicalField` and `canonicalField` read the exact key, so `{"Signer":"decentraland-kernel-scene"}` presented no `signer` and every predicate treated the field as absent — `rejectIfSigner('decentraland-kernel-scene')` answered *allowed* for metadata that visibly declares the signer it exists to refuse.

Such a key is now a rejection rather than an absence, in all four predicates and at every position a declared path reaches. Nothing is folded: the value is refused, never rewritten.

This also makes the predicates consistent with `canonicalMetadataKeys`, which already refused folded keys on the legacy-payload path.

Legitimate metadata is unaffected — a field spelled exactly as declared behaves as before, and an absent field is still absent. Signing a folded key requires holding the identity key, so this tightens a surprising result rather than closing a reachable bypass.
