---
"@dcl/content-validator": patch
"@dcl/http-commons": patch
"@dcl/urn-resolver": patch
---

Documentation-only updates to the published READMEs:

- `@dcl/content-validator`: fix on-chain and subgraph access-checker examples to use the actual subpath imports under `dist/validations/access/...` (the referenced symbols are not re-exported from the package root).
- `@dcl/http-commons`: add a README covering errors, middlewares (`errorHandler`, `bearerTokenMiddleware`, `ethAddressNormalizerMiddleware`), and utilities (`getPaginationParams`, `parseJson`, `generateRandomWalletAddress[es]`).
- `@dcl/urn-resolver`: align the documented Node prerequisite with `package.json` engines (`>=22.0.0`).
