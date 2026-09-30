---
'@dcl/crypto-middleware': minor
---

Support direct contract signature validation with an optional Ethereum RPC provider. Export a cancellable RPC provider and bounded auth-chain validator for services to share between signed-fetch middleware, HTTP bodies, and sockets. Existing consumers continue using Catalyst unless they supply a provider.
