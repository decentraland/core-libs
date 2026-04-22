# decentraland-crypto-fetch

Make requests signed using a [Decentraland Identity](https://github.com/decentraland/decentraland-crypto).

Migrated into the `core-libs` monorepo from the legacy [`decentraland-crypto-fetch`](https://github.com/decentraland/decentraland-crypto-fetch) repository.

## Install

```bash
pnpm add decentraland-crypto-fetch
```

Requires Node.js >= 22 (uses global `fetch`, `Headers`, `Request` and `URL`).

## Usage

This library preserves the native [`fetch`](https://developer.mozilla.org/en-US/docs/Web/API/fetch) API. You only need an identity generated with [`@dcl/crypto`](https://github.com/decentraland/decentraland-crypto):

```typescript
import fetch from 'decentraland-crypto-fetch'

fetch('https://service.decentraland.org/api/resource', {
  method: 'POST',
  identity
})
```

You can send signed metadata using the `metadata` property:

```typescript
import fetch from 'decentraland-crypto-fetch'

const metadata = { key1: 'value1' }

fetch('https://service.decentraland.org/api/resource', {
  method: 'POST',
  identity,
  metadata
})
```

You can also inject signed headers into an existing request:

```typescript
import fetch from 'decentraland-crypto-fetch'

const metadata = { key1: 'value1' }
const request = new Request('https://service.decentraland.org/api/resource', {
  method: 'POST'
})

fetch(request, { identity, metadata })
```

## Inject implementations

If your environment doesn't have native `fetch`, `Headers`, `Request` or `URL`, or you need to use a specific implementation, create a signed fetch using the factory:

```typescript
import { signedFetchFactory } from 'decentraland-crypto-fetch'
import fetch, { Headers, Request } from 'node-fetch'

const signedFetch = signedFetchFactory({ Headers, Request, fetch })
```

## Server

To build services that accept signed requests, use [`@dcl/crypto-middleware`](../crypto-middleware).
