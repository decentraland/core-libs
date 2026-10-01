---
'@dcl/crypto-middleware': minor
---

Support direct contract signature validation with an optional Ethereum RPC provider. Export a cancellable RPC provider and bounded auth-chain validator for services to share between signed-fetch middleware, HTTP bodies, and sockets. Existing consumers continue using Catalyst unless they supply a provider.

Sanitize provider failures before they enter signature error messages, cap decoded RPC response bodies at 1 MiB while streaming, and restrict signature-call results to 32 bytes.

Distinguish infrastructure failures from invalid signatures: middleware returns sanitized 503 responses without legacy retries, while known EVM reverts retain signature fallback behavior. Validate signer-address format before RPC and reject unsupported URL credentials at provider construction. Export provider protocol and validation-option types for consumers.
