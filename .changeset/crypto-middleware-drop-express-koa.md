---
"@dcl/crypto-middleware": major
---

Drop the Express and Koa middlewares; only the Well-Known Components middleware (`wellKnownComponents`) remains. This removes the optional `express` and `koa` peer dependencies and their `.d.ts` type references, so consumers no longer need `skipLibCheck` to build against this package.
