# @dcl/authoritative-delegation

The scope delegation claim that lets a headless authoritative scene server act for one scene without holding the authoritative private key. One implementation of the claim format, its builder and its verifier, shared by the service that mints the claim and the services that accept delegation-signed requests.

## Install

```bash
pnpm add @dcl/authoritative-delegation
```

## Consumers

- `badges`: verifies the claim on scene badge awards. First consumer.
- `world-storage-service`: verifies the claim on storage and env reads/writes. Will replace its own copy of the verifier (`src/utils/storage-delegation.ts`) with this package.
- `sdk-multiplayer-server`: mints the claim. Will build the payload with `buildClaimPayload` instead of its inline string.

Until all three use the package, the claim format is duplicated by hand in the other two, so it must not change.

## Model

- The orchestrator (`sdk-multiplayer-server`) holds `AUTHORITATIVE_SERVER_PRIVATE_KEY`. Per scene worker it generates a throwaway ephemeral keypair and signs a claim binding that ephemeral to `World`, `SceneId`, `Parcel` and an `Expiration`.
- The worker signs requests with the ephemeral and forwards the claim in the `x-authoritative-scope` header (base64 JSON `{ payload, signature }`).
- A service recovers the request signer with `@dcl/crypto-middleware`, then calls `verifyDelegation` with that signer, the request's target scene, and the trusted root address(es).

## API

```ts
import { buildClaimPayload, parseClaim, verifyDelegation, SCOPE_HEADER } from '@dcl/authoritative-delegation'

// mint side
const payload = buildClaimPayload({ ephemeral, world, sceneId, parcel, expiration })
const signature = Authenticator.createSignature(root, payload)

// verify side
const result = await verifyDelegation(req.headers[SCOPE_HEADER], {
  signer: recoveredSignerAddress,
  world,
  sceneId,
  parcel,
  trustedSigners: [AUTHORITATIVE_SERVER_ADDRESS]
})
if (!result.ok) reject(result.reason)
```

`verifyStorageDelegation` and the `Storage*` type names are aliases kept for world-storage-service's import swap.

## Claim payload

```
Decentraland Authoritative Storage Delegation
Ephemeral: 0x<addr>
World: <name>
SceneId: <hash>
Parcel: <x,y>
Expiration: <ISO8601>
```

Parsing is strict: the prefix line, then exactly these five lines, each once. Anything else fails closed.
