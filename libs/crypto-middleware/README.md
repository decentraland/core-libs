# @dcl/crypto-middleware

Well-Known Components authentication middleware for requests signed with [`@decentraland/SignedFetch`](https://docs.decentraland.org/creator/development-guide/scene-runtime/signed-fetch/).

Consolidation of the legacy [`decentraland-crypto-middleware`](https://github.com/decentraland/decentraland-crypto-middleware) and [`@dcl/platform-crypto-middleware`](https://github.com/decentraland/platform-crypto-middleware) packages.

## Install

```bash
pnpm add @dcl/crypto-middleware
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

`metadataValidator` is the library's only structural guard on the `x-identity-metadata` header — `verify()` itself only checks that the value is JSON-parseable and shaped as an object (not a primitive, not an array). An explicit JSON `null` is treated like a missing header and falls back to an empty object (`{}`), so `authMetadata` is always a safe object to dereference. Consumers are responsible for:

- **Size.** HTTP servers cap total header size (commonly 8–32 KB), which bounds input, but nothing prevents a pathological JSON object within that budget.
- **Shape.** If `P` has required fields, assert them inside `metadataValidator` — the type parameter is a contract, not a runtime check. The parsed value is cast, not validated.
- **Sensitive keys.** `JSON.parse` produces `__proto__` / `constructor` as own properties (not as actual prototype mutations), so there is no direct prototype-pollution vector through this library. Consumer code that later spreads or `Object.assign`s the metadata into other objects should still be aware that these keys may be present.

### The one built-in semantic check: canonical `signer` and `intent`

`verifyMetadata` requires `metadata.signer` and `metadata.intent` to arrive **already trimmed and lowercased** — formally, a string value must satisfy `value === value.trim().toLowerCase()` or the request is rejected with `400 Invalid chain metadata: "<raw metadata>"`. So `dcl:explorer`, `decentraland-kernel-scene` and `dcl:explorer:comms-handshake` pass; `DCL:Explorer`, `Decentraland-Kernel-Scene`, non-ASCII homoglyphs (the Kelvin sign `U+212A` lowercases to `k`) and whitespace-padded values like `" dcl:explorer"` do not.

The two halves of that rule guard different things, and it is worth knowing which is which:

- **Casing is not signature-bound.** The signed payload is lowercased (see the case-normalization note below), so `DCL:Explorer` and `dcl:explorer` share one valid signature. A third party — a TLS-terminating proxy — can flip case on an *intercepted* request and it still verifies. That is a genuine bypass, and it is the reason this check exists.
- **Whitespace is signature-bound.** The payload is never trimmed, so padding changes the signed bytes and nobody can add or strip it on an intercepted request. Padding is rejected to prevent a *silent misclassification* instead: `" decentraland-kernel-scene"` signs and verifies perfectly well, then misses the consumer's strict equality check and is read as a directly user-signed — more trusted — request. A loud `400` is better than a quiet promotion.

Services identify the caller by strict equality on these fields, so in both cases the outcome this prevents is the same: a request being read downstream as something it is not, typically promoting a scene- or explorer-originated request onto the more trusted directly-user-signed path.

**Hex addresses are exempt from the casing rule.** A value matching `^0x[a-fA-F0-9]{40}$` passes regardless of casing, because EIP-55 checksum casing is meaningful and re-casing hex cannot change which address the value denotes — there is no escalation to prevent. Two consequences of that pattern being anchored: the prefix must be a lowercase `0x` (matching `EthAddress.schema.pattern` in `@dcl/schemas`), so `0XAbC…` is *not* treated as an address; and a padded address such as `" 0xabc…"` is still rejected.

Scope and behaviour:

- **Only these two fields, only at the top level.** The rule does not recurse into nested objects, so `realm: { serverName: 'MyRealm' }` is untouched.
- **Only string values.** Numbers, `null`, objects and absent keys pass through.
- **Reject, never normalize.** The library will not silently lowercase your metadata — the client must send what it signed.
- **No configuration.** If you need the same guarantee on other fields, enforce it in `metadataValidator`, which runs *after* this guard and therefore never sees a non-canonical `signer` or `intent`.

The message is the same one the parse and shape rejections use, which keeps the error surface unchanged; since `DEFAULT_ERROR_FORMAT` passes 4xx through verbatim, the client sees its own metadata echoed back (truncated at 64 characters) and can spot the casing itself.

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

  `signer` and `intent` are the only exceptions — see [The one built-in semantic check](#the-one-built-in-semantic-check-canonical-signer-and-intent). That guard closes the two fields services authorize on; **this warning still applies in full to every other metadata field**, and to the path. If your service makes an authorization decision on a case-sensitive comparison of `sceneId`, `realmName`, `realm.serverName`, or anything else, you have the same exposure and must handle it yourself.

## Migration

### From `decentraland-crypto-middleware`

- Rename `verifyMetadataContent` → `metadataValidator`.
- Default catalyst changed from `peer-lb.decentraland.org` to `peer.decentraland.org`.
- The middleware runs expiration checks before calling the catalyst; expired signatures fail faster.

### From `@dcl/platform-crypto-middleware`

- `fetcher` is now optional — defaults to the global `fetch`.
- Metadata validation error is now `Invalid metadata content: <json>` (was `Invalid metadata`).
- The Express and Koa adapters have been removed; use `wellKnownComponents`.
- **Behavior change:** `metadata.signer` and `metadata.intent` must now arrive already trimmed and lowercased (hex addresses are exempt from the casing rule) or the request is rejected with `400 Invalid chain metadata: "<raw metadata>"`. Requests that previously reached your handler with, say, `Decentraland-Kernel-Scene`, `DCL:Explorer`, or a stray leading space will now fail. If you send either field, confirm your client emits it lowercase and unpadded before upgrading. See [The one built-in semantic check](#the-one-built-in-semantic-check-canonical-signer-and-intent).
