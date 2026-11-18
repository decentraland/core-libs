---
'@dcl/crypto': minor
---

Require every link between the SIGNER and the last link of an auth chain to be a delegation.

`isValidAuthChain` only checked that the SIGNER came first and appeared once. It now also requires each link after the SIGNER and before the last one to be `ECDSA_EPHEMERAL`, `ECDSA_EIP_1654_EPHEMERAL` or one of the scoped link types, and it applies the scoped-login structure of `findScopedLink` (ADR-162). A signed-entity link (`ECDSA_SIGNED_ENTITY` or `ECDSA_EIP_1654_SIGNED_ENTITY`) is therefore accepted only as the last link, and `validateSignature` refuses any other chain with `ERROR: Malformed authChain`. A chain with a misplaced scoped link still reports `Invalid scoped login chain`.

Chains built by `createAuthChain`, `initializeAuthChain`, `initializeScopedAuthChain` and `signPayload` are unaffected.
