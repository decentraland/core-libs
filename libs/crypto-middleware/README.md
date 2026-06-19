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

## Options

| Name                | Type                                         | Description                                                                                                    |
| ------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `optional`          | `boolean`                                    | If `true`, requests without a valid signature fall through silently. Default: `false`.                         |
| `expiration`        | `number`                                     | Time in milliseconds a signature stays valid. Default: `60_000`.                                               |
| `catalyst`          | `string`                                     | Catalyst URL used to validate contract wallet (EIP-1654) signatures. Default: `https://peer.decentraland.org`. |
| `fetcher`           | `IFetchComponent`                            | Optional Well-Known-Components fetch component. If omitted, global `fetch` is used.                            |
| `maxChainLength`    | `number`                                     | Maximum number of `x-identity-auth-chain-*` headers accepted. Default: `10`.                                   |
| `metadataValidator` | `(metadata: P) => boolean`                   | Runs after expiration, before signature verification. Return `false` to reject the request with a 400.         |
| `onError`           | `(err: Error) => any`                        | Formats the response body on failure. Default sanitizes 5xx messages to `"Internal error"`; echoes 4xx as-is.  |

## Metadata handling

`metadataValidator` is the library's only structural guard on the `x-identity-metadata` header — `verify()` itself only checks that the value is JSON-parseable and shaped as an object (not a primitive, not an array, not `null`). Consumers are responsible for:

- **Size.** HTTP servers cap total header size (commonly 8–32 KB), which bounds input, but nothing prevents a pathological JSON object within that budget.
- **Shape.** If `P` has required fields, assert them inside `metadataValidator` — the type parameter is a contract, not a runtime check. The parsed value is cast, not validated.
- **Sensitive keys.** `JSON.parse` produces `__proto__` / `constructor` as own properties (not as actual prototype mutations), so there is no direct prototype-pollution vector through this library. Consumer code that later spreads or `Object.assign`s the metadata into other objects should still be aware that these keys may be present.

## Error format

`DEFAULT_ERROR_FORMAT` emits `{ ok: false, message: 'Internal error' }` for status codes `>= 500` and `{ ok: false, message: err.message }` for client-side errors (`< 500`). The sanitization avoids echoing upstream catalyst hostnames, response bodies, or unexpected internal messages to the client. Consumers that prefer full-fidelity errors (for observability tooling, trusted internal APIs, etc.) should provide their own `onError`:

```ts
wellKnownComponents({ onError: (err) => ({ ok: false, message: err.message, cause: String(err) }) })
```

4xx messages are returned as-is because they include information that helps the client correct its request. User-supplied fragments echoed into those messages (e.g. the raw timestamp or metadata string that failed to parse) are truncated at 64 characters to bound response size and limit the impact of header-based injection payloads. Consumers should still **never** render error-response bodies as HTML — they are JSON by default and any renderer that interprets them as markup is responsible for its own escaping.

## Threat model and operational notes

- **`options.catalyst` must be trusted configuration.** It is passed through to `new URL(...)` and used as the outbound destination for signature verification. Accepting this value from end-user input (query strings, request bodies, etc.) opens an SSRF vector — a client could direct the server at arbitrary internal hosts. Pin it in startup config and treat it like a database connection string.

- **Incoming request size is bounded by the HTTP server, not by this library.** Keep `maxHeaderSize` / `maxHeadersCount` on your HTTP server set to sensible values. `extractAuthChain` caps at `DEFAULT_MAX_CHAIN_LENGTH = 10` entries per request; the `maxChainLength` option lets you tighten this further. `verifyMetadata` parses the metadata header value via `JSON.parse`; depth/shape validation beyond "must be an object" is the consumer's responsibility via `metadataValidator`.

- **Case-insensitive payload normalization is a known protocol property.** The canonical Decentraland signed-fetch payload is `(method + ':' + path + ':' + timestamp + ':' + metadata).toLowerCase()`. Two requests whose metadata or path differ only in case produce the same signed payload and therefore share the same valid signature — but the consumer receives the header bytes as delivered, not the lowercased version. A TLS-terminating intermediary could flip case in the metadata header without invalidating the signature. Consumer code that relies on `metadata` fields being case-sensitive (user-supplied IDs, arbitrary strings) should normalize case inside `metadataValidator` or downstream, or reject any metadata whose canonical representation differs from what was signed.

## Migration

### From `decentraland-crypto-middleware`

- Rename `verifyMetadataContent` → `metadataValidator`.
- Default catalyst changed from `peer-lb.decentraland.org` to `peer.decentraland.org`.
- The middleware runs expiration checks before calling the catalyst; expired signatures fail faster.

### From `@dcl/platform-crypto-middleware`

- `fetcher` is now optional — defaults to the global `fetch`.
- Express and Koa adapters are available in addition to `wellKnownComponents`.
- Metadata validation error is now `Invalid metadata content: <json>` (was `Invalid metadata`).
