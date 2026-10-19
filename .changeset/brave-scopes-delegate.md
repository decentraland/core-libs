---
'@dcl/authoritative-delegation': minor
---

Add `@dcl/authoritative-delegation`: the scope delegation claim that lets a headless authoritative scene server act for one scene and one service without holding the authoritative private key. `buildClaimPayload` for the minter, `parseClaim` and `verifyDelegation` for the services that accept delegation-signed requests. Each claim names its `Audience`, and `verifyDelegation` rejects a claim minted for another service. `verifyDelegation` caps claim lifetime with `maxTtlMs` (default 2h).
