---
'@dcl/crypto': patch
---

Upgrade `@dcl/schemas` to `^27.3.0` so consumers already on schemas 27 no longer install a second nested copy. The re-exported `AuthChain`, `AuthLink` and `AuthLinkType` declarations are identical; the re-exported `AuthChain.validate`/`AuthLink.validate` now apply the 27.x limits (at most 10 links, `payload`/`signature` up to 100000 characters).
