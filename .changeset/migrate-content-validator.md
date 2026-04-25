---
"@dcl/content-validator": patch
---

Migrate `@dcl/content-validator` from the standalone `content-validator` repository into the `core-libs` monorepo. The package now consumes `@dcl/hashing` and `@dcl/urn-resolver` via workspace references. Tests were aligned with the shared Decentraland testing conventions and additional coverage was added for previously untested branches.
