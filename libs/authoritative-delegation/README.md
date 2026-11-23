# @dcl/authoritative-delegation

The scope delegation claim that lets a headless authoritative scene server act for one scene, toward one service, without holding the authoritative private key. One implementation of the claim format, its builder and its verifier, shared by the service that mints the claim and the services that accept delegation-signed requests.

## Install

```bash
pnpm add @dcl/authoritative-delegation
```

## Consumers

- `badges`: verifies `badges` claims on scene badge awards. First consumer.
- `sdk-multiplayer-server`: mints the claims with `buildClaimPayload`.
- Scene workers (`hammurabi-headless`, bevy-explorer's headless engine): carry the claims and attach the right one per service. `parseClaim` reads world, scene, parcel and expiry out of a claim to renew it.

world-storage-service keeps verifying its own v1 claim (`Decentraland Authoritative Storage Delegation`, no audience), which this package does not implement. The two formats have different first lines, so neither ever parses as the other. Storage moves to this format, with `Audience: storage`, once its verifier accepts both.

## Model

- The orchestrator (`sdk-multiplayer-server`) holds `AUTHORITATIVE_SERVER_PRIVATE_KEY`. Per scene worker and per audience it generates a throwaway ephemeral keypair and signs a claim binding that ephemeral to an `Audience`, `World`, `SceneId`, `Parcel` and an `Expiration`.
- The worker signs a service's requests with that service's ephemeral and forwards that service's claim in the `x-authoritative-scope` header (base64 JSON `{ payload, signature }`). It never sends one service's claim to another.
- A service recovers the request signer with `@dcl/crypto-middleware`, then calls `verifyDelegation` with its own audience, that signer, the request's target scene, and the trusted root address(es).

A separate ephemeral per audience matters because the signed-fetch payload doesn't include the host: with one shared key, a request captured at one service could be replayed at another wherever the paths overlap.

## API

```ts
import { buildClaimPayload, parseClaim, verifyDelegation, SCOPE_HEADER } from '@dcl/authoritative-delegation'

// mint side
const payload = buildClaimPayload({ audience: 'badges', ephemeral, world, sceneId, parcel, expiration })
const signature = Authenticator.createSignature(root, payload)

// verify side
const result = await verifyDelegation(req.headers[SCOPE_HEADER], {
  audience: 'badges',
  signer: recoveredSignerAddress,
  world,
  sceneId,
  parcel,
  trustedSigners: [AUTHORITATIVE_SERVER_ADDRESS],
  maxTtlMs: 60 * 60 * 1000 // optional, defaults to DEFAULT_MAX_TTL_MS (2h)
})
if (!result.ok) reject(result.reason)
```

`buildClaimPayload` throws if a value doesn't match its format (`AUDIENCE_FORMAT`, `EPHEMERAL_FORMAT`, `WORLD_FORMAT`, `SCENE_ID_FORMAT`, `PARCEL_FORMAT`) or `expiration` is not a valid date. It lowercases the ephemeral and the world (ASCII only) for you.

`verifyDelegation` takes the header as Node delivers it (`string | string[] | undefined`): a missing or repeated header is a rejection, not a throw. A `maxTtlMs` that isn't a finite positive number rejects every claim, so a misconfigured value fails closed.

## Claim payload

```
Decentraland Authoritative Delegation
Audience: <service>
Ephemeral: 0x<addr>
World: <name>
SceneId: <hash>
Parcel: <x,y>
Expiration: <ISO8601>
```

`Audience` is a service id (`badges`, `storage`), not a hostname, so every environment of a service shares it; environments are told apart by their trusted signers.

Parsing is strict: the prefix line, then exactly these six lines, each once, in any order. Each line is `<Field>: <value>` with one space, and each value must match its exported format as written, with no case folding. `Expiration` must be the exact `Date#toISOString()` form, UTC with milliseconds (`2030-01-01T00:00:00.000Z`); a minter in another language must write that form (in Rust/chrono, `to_rfc3339_opts(SecondsFormat::Millis, true)`). Anything else fails closed.
