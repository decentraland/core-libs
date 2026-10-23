---
'@dcl/crypto': minor
'@dcl/crypto-middleware': minor
---

Support scoped logins (ADR-162): an ephemeral key delegated only a listed set of operations, per service and optionally per resource, through the new `ECDSA_SCOPED_EPHEMERAL` and `ECDSA_EIP_1654_SCOPED_EPHEMERAL` link types.

`@dcl/crypto` adds `getScopedEphemeralMessage`, `parseScopedEphemeralPayload` (strict), `initializeScopedAuthChain` and `isOperationGranted`. `validateSignature` takes an optional fifth argument: a chain with a scoped link is valid only when it names a `service` the login grants something to, and the result then carries those grants in `scope`. Without it, scoped chains are rejected, as they are by earlier versions, so upgrading changes nothing for a service that doesn't opt in. Chains without a scoped link validate as before.

`@dcl/crypto-middleware` adds the `service`, `operation`, `resource` and `maxScopedLoginLifetime` options, `verification.scope` and `validateScopedAuthChainSignature`. With `service`, a route accepts a scoped login only when it declares the one `operation` it performs (a string, or a function of the request) and the login grants it: 403 when it doesn't, 401 when the route declares none. Full logins always pass. Contract-wallet scoped logins are validated only with a `provider`, and are never sent to the catalyst.
