# @dcl/single-sign-on-client

Stores, retrieves and clears a [Decentraland Identity](https://github.com/decentraland/decentraland-crypto) in the browser's `localStorage`.

Migrated into the `core-libs` monorepo from the legacy [`single-sign-on-client`](https://github.com/decentraland/single-sign-on-client) repository.

> **Note:** as of `3.0.0` this library no longer loads the Single Sign On iframe/webapp (and no longer exposes the `SingleSignOn` singleton or connection-data helpers from `2.0.0`). It reads and writes the identity directly from the consuming application's own `localStorage`, so the identity is scoped to the current origin and is **not** shared across Decentraland domains.

## Install

```bash
pnpm add @dcl/single-sign-on-client
```

## Usage

```ts
import * as SingleSignOn from '@dcl/single-sign-on-client'
import { Authenticator, AuthIdentity } from '@dcl/crypto'

const address: string = '0x...'

const identity: AuthIdentity = await Authenticator.initializeAuthChain(address, ...)

// Persist the identity (ignored if it is already expired).
SingleSignOn.storeIdentity(address, identity)

// Read it back. Returns null when missing, malformed or expired (and clears it in the latter cases).
const storedIdentity: AuthIdentity | null = SingleSignOn.getIdentity(address)

// Remove it.
SingleSignOn.clearIdentity(address)
```

`address` must be a valid Ethereum address; otherwise these functions throw. All three operate synchronously on `localStorage`.

### Back-compat aliases

The `localStorage`-prefixed names from the `0.1.x` line are still exported as aliases, so existing consumers can upgrade without code changes:

```ts
import {
  localStorageGetIdentity, // === getIdentity
  localStorageStoreIdentity, // === storeIdentity
  localStorageClearIdentity // === clearIdentity
} from '@dcl/single-sign-on-client'
```

Prefer the unprefixed names in new code.
