---
'@dcl/crypto-middleware': minor
---

Validate contract-wallet signatures directly on a configured Ethereum network through an optional `provider` option. Consumers without a provider keep the Catalyst path.

Add `createSignatureRpcProvider`, a bounded JSON-RPC client for signature verification, and `validateAuthChainSignature`, so services can share one provider between signed-fetch middleware, HTTP bodies and sockets. Validation is bounded by a deadline, a per-validation RPC call budget and a chain-length limit, and requires a signer plus at least one signed link.

RPC outages and timeouts throw `SignatureValidationInfrastructureError` and map to `503` without the legacy-payload retry. Contract reverts from geth, Besu, Nethermind and Hardhat-style nodes keep the normal signature fallback. Upstream error text never reaches callers, and redirects and URL credentials are refused.
