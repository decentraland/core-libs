---
"@dcl/content-validator": minor
---

Add `createStagingValidator` and `createStagingValidateFns` for composing the partial-deployment (staging) validation subset — the content-independent validations that can be checked before all of an entity's content is present — without importing individual validations from `dist/`.

`createStagingValidateFns(components)` returns the staging subset (entity structure, IPFS hashing, metadata schema, ADR-45, signature, scene rules, and the "no unreferenced files" check), deliberately excluding the size validation, content completeness, and non-scene type validations. It is scene-only: a non-scene entity is rejected up front rather than silently accepted after skipping its type-specific checks. `createStagingValidator(components, options?: StagingValidatorOptions)` composes them into a ready validator and appends the access check only when `includeAccessCheck` is set (it is the expensive on-chain/subgraph call and may be skipped on a trusted resume request; the full `createValidator` still runs it at finalize). Its failures log under `ContentValidator:staging` so they are distinguishable from the full validator's.

This lets multi-request upload flows validate staging requests through the library's public API instead of deep-importing individual `dist/validations/*` functions.
