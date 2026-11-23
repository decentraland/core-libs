---
'@dcl/content-validator': minor
---

Require third-party wearable and emote merkle proofs to commit every metadata field. `merkleProof.hashingKeys` must list each top-level metadata field other than `merkleProof` exactly once, so every field served with the item is covered by its approved merkle leaf. A deployment is rejected when a metadata field is missing from `hashingKeys`, when a key is repeated, or when `hashingKeys` names `merkleProof` itself.

The rule applies to every third-party item with no timestamp gate. All third-party deployments previously accepted by the catalysts already satisfy it, so nodes re-validating history while bootstrapping are unaffected, and proofs produced by the Builder already list every metadata field.
