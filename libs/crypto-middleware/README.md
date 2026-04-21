# @dcl/crypto-middleware

Multi-framework authentication middleware for requests signed with [`@decentraland/SignedFetch`](https://docs.decentraland.org/creator/development-guide/scene-runtime/signed-fetch/).

Consolidation of the legacy [`decentraland-crypto-middleware`](https://github.com/decentraland/decentraland-crypto-middleware) and [`@dcl/platform-crypto-middleware`](https://github.com/decentraland/platform-crypto-middleware) packages.

## Install

```bash
pnpm add @dcl/crypto-middleware
```

If you use the Express or Koa adapters, also install the framework as a peer dependency:

```bash
pnpm add express        # for the Express adapter
pnpm add koa            # for the Koa adapter
pnpm add passport       # for the Passport adapter
```

Requires Node.js >= 22 (uses global `fetch`).

## Usage

### Well-Known Components

```ts
import { wellKnownComponents, DecentralandSignatureRequiredContext } from '@dcl/crypto-middleware'

router.use('/user/required', wellKnownComponents({ fetcher: components.fetch }))
router.get('/user/required', (ctx: DecentralandSignatureRequiredContext) => {
  return { body: { address: ctx.verification.auth } }
})
```

### Express

```ts
import { Request } from 'express'
import * as dcl from '@dcl/crypto-middleware'

app.get(
  '/user/required',
  dcl.express(),
  (req: Request & dcl.DecentralandSignatureData) => {
    res.json({ address: req.auth })
  }
)
```

### Koa

```ts
import { Context } from 'koa'
import * as dcl from '@dcl/crypto-middleware'

app.use(dcl.koa())
app.use((ctx: Context & dcl.DecentralandSignatureData) => {
  ctx.body = { address: ctx.auth }
})
```

### Passport

```ts
import passport from 'passport'
import * as dcl from '@dcl/crypto-middleware'

passport.use(dcl.passport())

app.get(
  '/user/required',
  passport.authenticate('decentraland'),
  (req, res) => res.json({ address: req.auth })
)
```

## Options

| Name                | Type                                         | Description                                                                                               |
| ------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `optional`          | `boolean`                                    | If `true`, requests without a valid signature fall through silently. Default: `false`.                    |
| `expiration`        | `number`                                     | Time in milliseconds a signature stays valid. Default: `60_000`.                                          |
| `catalyst`          | `string`                                     | Catalyst URL used to validate contract wallet (EIP-1654) signatures. Default: `https://peer.decentraland.org`. |
| `fetcher`           | `IFetchComponent`                            | Optional Well-Known-Components fetch component. If omitted, global `fetch` is used.                       |
| `metadataValidator` | `(metadata: P) => boolean`                   | Runs before signature verification. Return `false` to reject the request with a 400.                      |
| `onError`           | `(err) => any`                               | Formats the response body on failure. Default: `{ ok: false, message: err.message }`.                     |

## Migration

### From `decentraland-crypto-middleware`

- Rename `verifyMetadataContent` → `metadataValidator`.
- Default catalyst changed from `peer-lb.decentraland.org` to `peer.decentraland.org`.
- The middleware runs expiration checks before calling the catalyst; expired signatures fail faster.

### From `@dcl/platform-crypto-middleware`

- `fetcher` is now optional — defaults to the global `fetch`.
- Express, Koa, and Passport adapters are available in addition to `wellKnownComponents`.
- Metadata validation error is now `Invalid metadata content: <json>` (was `Invalid metadata`).
