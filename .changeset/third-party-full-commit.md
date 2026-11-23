---
'@dcl/content-validator': minor
---

Require third-party wearable and emote merkle proofs to commit every metadata field. From the new `THIRD_PARTY_FULL_COMMIT_TIMESTAMP` on, `merkleProof.hashingKeys` must list each top-level metadata field other than `merkleProof` exactly once, so every field served with the item is covered by its approved merkle leaf. A deployment is rejected when a metadata field is missing from `hashingKeys`, when a key is repeated, or when `hashingKeys` names `merkleProof` itself.

The cutoff is set to `2026-12-15T00:00:00Z` and is overridable through the environment like the existing ADR timestamps. Items deployed before it keep validating, so nodes re-validating history while bootstrapping are unaffected. Proofs produced by the Builder already list every metadata field, so existing publishing flows keep working. The required `id`, `content` and `data` / `emoteDataADR74` keys are still enforced for every item regardless of its timestamp.
