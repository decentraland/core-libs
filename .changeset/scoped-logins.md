---
'@dcl/crypto': minor
'@dcl/crypto-middleware': minor
---

Support scoped logins (ADR-162): an ephemeral key delegated only a listed set of operations, per service and optionally per resource, through the new `ECDSA_SCOPED_EPHEMERAL` and `ECDSA_EIP_1654_SCOPED_EPHEMERAL` link types.

`@dcl/crypto` adds strict scoped-login builders/parsers, `initializeScopedAuthChain`, `isOperationGranted`, the pure grant/action checker `authorizeScope`, and `authorizeSignature`. Identity/signature validation through `validateSignature` returns the service grants but does not authorize an action; `authorizeSignature` requires a service, operation and optional canonical resource and returns success only when granted. Scoped validation defaults to a 24-hour maximum remaining validity, with an explicit positive override. `scope.expiration` is the earliest expiration across the whole chain. Existing full-login chains validate as before.

`@dcl/crypto-middleware` accepts scoped requests only after checking the operation/resource through per-route middleware or the signed-fetch `verify` API. Direct `verify` calls require an operation with `service` at runtime. The existing option interface remains extensible; `ScopedVerifyOptions` adds opt-in compile-time requirements. Resolvers run once, and `verification.resource` exposes the exact checked canonical value read-only for handlers to use. Unmapped operations return 403/`SCOPED_OPERATION_REQUIRED`; resolver errors produce controlled 403s and cannot be bypassed by `optional`. Resource resolvers must succeed for full logins too; failures use the same controlled 403 codes. Existing `dist` module entry points remain available through an exports map, while new internal identity verification is inaccessible through package imports. The same default 24-hour cap applies. Address-only helpers and `validateAuthChainSignature` reject scoped credentials. Contract-wallet scoped logins require a provider and never reach the catalyst.

Clients must warn that wildcard grants include future operations and that credentials apply across environments sharing a service identifier. Schema-validating consumers need the new link types before adoption.
