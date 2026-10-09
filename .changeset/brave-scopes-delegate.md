---
'@dcl/authoritative-delegation': minor
---

Add `@dcl/authoritative-delegation`: the scope delegation claim that lets a headless authoritative scene server act for one scene without holding the authoritative private key. `buildClaimPayload` for the minter, `parseClaim` and `verifyDelegation` for the services that accept delegation-signed requests. Lifted from world-storage-service's verifier; `verifyStorageDelegation` and the `Storage*` types are aliases for its import swap.
