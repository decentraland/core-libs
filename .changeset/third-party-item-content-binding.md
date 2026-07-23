---
"@dcl/content-validator": patch
---

Enforce content/pointer binding for third-party items and move the outfits pointer-ownership check into the access layer.

- Third-party emotes are now bound to their approved Merkle leaf. An approved third-party wearable's proof can no longer be reused to deploy an emote at the wearable's official pointer: `thirdPartyEmoteMerkleProofContentValidateFn` checks that the metadata `id` matches the pointer, that the uploaded files match the committed `content` map, and that the proof commits `emoteDataADR74`.
- Third-party wearable and emote bindings now require `id`, `content` (and `data`/`emoteDataADR74` respectively) to be present in `merkleProof.hashingKeys`, so those fields are actually committed by the leaf instead of being trusted from attacker-supplied metadata.
- The outfits access validator now also verifies that the deployment pointer (`<address>:outfits`) belongs to the signer, matching the profile and store access checks. This is a consistency change, not a fix for a live gap: the same check already runs at deploy time in the stateless validation pipeline (which `createValidator` executes before the access check), so outfits pointers were never hijackable. It only makes the access checker correct on its own.
