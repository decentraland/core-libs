---
'@dcl/crypto': minor
'@dcl/content-validator': patch
---

Upgrade `@dcl/schemas` to `^27.3.0` so consumers already on schemas 27 no longer install a second nested copy. The re-exported `AuthChain`, `AuthLink` and `AuthLinkType` declarations are identical; the re-exported `AuthChain.validate`/`AuthLink.validate` now apply the 27.x limits (at most 10 links, `payload`/`signature` up to 100000 characters). `@dcl/content-validator` moves to `^27.3.0` too, so the workspace resolves a single schemas copy.
