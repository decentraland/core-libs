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

### Metadata casing is bound by the signature

The signed payload joins the metadata bytes **verbatim** — only the method, path and timestamp are lowercased. The metadata that arrives must therefore be byte-for-byte what was signed. A request that re-cases a property name or a value (`{"Signer":...}` for `{"signer":...}`, `sceneid` for `sceneId`) no longer reproduces the signed payload and fails verification with `401 Invalid signature`.

This matters because services identify the caller by strict equality on metadata fields. Under the previous format the payload was lowercased in full, so `{"Signer":...}` and `{"signer":...}` produced identical signed bytes: an intermediary could rename the key, keep the signature valid, and the field would read as *absent* to a consumer checking `metadata.signer !== 'decentraland-kernel-scene'` — promoting a scene-originated request onto the more trusted directly-user-signed path. The same rewrite worked on consumer-defined fields such as `sceneId`, `parcel` and `isGuest`.

The library performs no canonicalization of its own: `verifyMetadata` parses the header and returns it untouched, so `authMetadata` holds exactly the object the client sent. Casing, whitespace and key order are all the client's to get right, and all of them are covered by the signature.

### Composable metadata validators

Because the library canonicalizes nothing, a field compared by equality needs the non-canonical case refused before the comparison, or a re-spelled value reads as something the request is not. Three predicates cover that:

```ts
import { rejectIfSigner, requireSigner, requireCanonicalField } from '@dcl/crypto-middleware'

// "not for scenes" — absent `signer` passes; a re-spelled one is refused, not compared
wellKnownComponents({ metadataValidator: rejectIfSigner('decentraland-kernel-scene') })

// "only for scenes" — fails closed on absent, non-canonical, or unlisted
wellKnownComponents({ metadataValidator: requireSigner('decentraland-kernel-scene', 'dcl:authoritative-server') })

// any other field
wellKnownComponents({ metadataValidator: requireCanonicalField('intent', 'dcl:explorer:comms-handshake') })
```

All four refuse a key that case-folds to the field without being spelled exactly that — `{"Signer": …}` is rejected by `rejectIfSigner('…')` rather than read as "no signer". Without that, a predicate would answer *allowed* for metadata visibly declaring the signer it exists to refuse. The value is never rewritten; the request is refused.

All four read fields as **own properties**. That matters: a plain `m.field` read walks the prototype chain, so a polluted `Object.prototype` can satisfy an equality check with a value no client ever sent. Compare through `requireCanonicalField` rather than writing `m.field === '...'` yourself.

`canonicalField(name)` checks form only — it passes when the field is absent and fails when present but not a trimmed-lowercase string. Use it when you are not comparing the value; when you are, use `requireCanonicalField`.

`rejectIfSigner`, `requireSigner` and `requireCanonicalField` throw at construction if handed a non-string, empty, or non-canonical value, so a predicate that could never match is a startup error rather than a silent gap.

None of this runs unless you compose it in — the library still has no opinion about which fields exist or what their values mean.

### Accepting the legacy payload during a migration

`canonicalMetadataKeys` opts a service into verifying requests still signed with the pre-6.0.0 format, for the window in which its callers have not shipped the new one. It is **absent by default** and should stay that way unless the callers genuinely cannot be sequenced ahead of the service — an explorer fleet, for instance, where a client release cannot be deployed atomically with a deploy.

```ts
wellKnownComponents({
  metadataValidator: rejectIfSigner('decentraland-kernel-scene'),
  canonicalMetadataKeys: ['signer', 'intent', 'sceneId', 'parcel', 'realm.serverName']
})
```

The current format is tried first and, when it verifies, nothing else happens — a caller that has shipped gets the full guarantee immediately. Only a signature mismatch falls through to the legacy payload.

**What keeps this from being a bypass.** The legacy payload folds the metadata, so its casing is outside the signature and `{"Signer":…}` shares a valid signature with `{"signer":…}`. Before accepting such a request, every key listed must be delivered in exactly that spelling; anything else is a `400`. Dotted paths address nested fields, and a path is followed through arrays as well as objects — declaring `'items.sceneId'` checks every object inside `items`, rather than stopping at the array and guarding nothing. A field delivered under *two* spellings at once is refused as ambiguous even when one of them is canonical, because which one the service reads would depend on key order rather than on anything the signature pinned. The ambiguity is refused rather than resolved, so no value is ever rewritten — `authMetadata` still holds exactly what the client sent.

The list doubles as the switch deliberately: there is no way to accept the legacy payload without naming the fields that make doing so safe. It is validated at the start of every `verify()` call, not on the legacy branch, so a misconfigured rollout fails on the first request rather than on the first one that happens to need the fallback — and because this ships as JavaScript, the check is a runtime one: a non-array, an empty list, a non-string entry or an empty dotted segment all throw.

**Scope of the guarantee.** It covers the fields you list, at every position a declared path reaches. Declaring a container alone — `'realm'` rather than `'realm.serverName'` — guards only that container's own key spelling, not the keys inside it; list the full path for anything you authorize on. An unlisted field stays unbound on the legacy path — which is sound only because a field the service does not authorize on cannot change an authorization decision. Derive the list from what the code actually reads.

**Values are not covered here.** Compose `rejectIfSigner`, `requireSigner` or `requireCanonicalField` into `metadataValidator`; it runs before signature verification and therefore guards both paths. Requiring canonical *values* in this guard would refuse legitimate traffic, since fields like `sceneId` carry case-sensitive CIDs.

**One operational note.** An EIP-1654 chain pays a second catalyst round-trip when it falls through to the legacy path. Acceptable for a migration window, not indefinitely — remove the option once the callers have migrated.

### Building the payload from a signer

`createPayload` is exported so a signer can build the payload with the same code that verifies it, which is the only way to guarantee the two cannot drift:

```ts
import { createPayload } from '@dcl/crypto-middleware'

const payload = createPayload(method, path, timestamp, JSON.stringify(metadata))
const authChain = Authenticator.signPayload(identity, payload)
```

Reach for this rather than reimplementing the format, and rather than deep-importing `dist/verify` — that path is not public API and may be reorganized.

## Error format

`DEFAULT_ERROR_FORMAT` emits `{ ok: false, message: 'Internal error' }` for status codes `>= 500` and `{ ok: false, message: err.message }` for client-side errors (`< 500`). The sanitization avoids echoing upstream catalyst hostnames, response bodies, or unexpected internal messages to the client. Consumers that prefer full-fidelity errors (for observability tooling, trusted internal APIs, etc.) should provide their own `onError`:

```ts
wellKnownComponents({ onError: (err) => ({ ok: false, message: err.message, cause: String(err) }) })
```

4xx messages are returned as-is because they include information that helps the client correct its request. User-supplied fragments echoed into those messages (e.g. the raw timestamp or metadata string that failed to parse) are truncated at 64 characters to bound response size and limit the impact of header-based injection payloads. Consumers should still **never** render error-response bodies as HTML — they are JSON by default and any renderer that interprets them as markup is responsible for its own escaping.

## Threat model and operational notes

- **`options.catalyst` must be trusted configuration.** It is passed through to `new URL(...)` and used as the outbound destination for signature verification. Accepting this value from end-user input (query strings, request bodies, etc.) opens an SSRF vector — a client could direct the server at arbitrary internal hosts. Pin it in startup config and treat it like a database connection string.

- **Incoming request size is bounded by the HTTP server, not by this library.** Keep `maxHeaderSize` / `maxHeadersCount` on your HTTP server set to sensible values. `extractAuthChain` caps at `DEFAULT_MAX_CHAIN_LENGTH = 10` entries per request; the `maxChainLength` option lets you tighten this further. `verifyMetadata` parses the metadata header value via `JSON.parse`; depth/shape validation beyond "must be an object" is the consumer's responsibility via `metadataValidator`.

- **The path is still case-normalized; the metadata is not.** The signed payload is `method.toLowerCase() + ':' + path.toLowerCase() + ':' + timestamp + ':' + metadata`. Metadata casing is signature-bound, but two requests whose **paths** differ only in case still produce the same signed payload and share one valid signature, and the consumer receives the path as delivered. A TLS-terminating intermediary could flip case in the path without invalidating the signature. If your service makes an authorization decision on a case-sensitive path segment, compare it case-insensitively or normalize it before use.

## Migration

### From 5.x (breaking: signed payload format)

The signed payload no longer lowercases the metadata:

| | Payload |
| --- | --- |
| 5.x | `(method + ':' + path + ':' + timestamp + ':' + metadata).toLowerCase()` |
| 6.x | method, path and timestamp lowercased, then `':' + metadata` joined verbatim |

**Signers and verifiers must be upgraded together.** A client still signing the 5.x payload fails with `401 Invalid signature` on every request whose metadata contains an uppercase character — in practice every scene-originated request, since all explorer clients emit camelCase keys (`sceneId`, `isGuest`, `realm.serverName`). Clients that sign `{}` or all-lowercase metadata are unaffected, because lowercasing those bytes is a no-op.

Paths are unaffected: they are still lowercased on both sides, so mixed-case path segments keep working.

Also removed in 6.0: the canonical `signer` / `intent` value check from 5.1.0, which rejected values such as `Decentraland-Kernel-Scene` or `" decentraland-kernel-scene"` with a `400`.

The signature does not replace it one-for-one, so be precise about what changed. Metadata altered **after** signing now fails with `401 Invalid signature`, and that covers everything the old check could not see — property names, nested fields and consumer-defined keys. A client that **signs a non-canonical value in the first place** verifies successfully and the handler receives the value untouched:

| Signed | Delivered | Result |
| --- | --- | --- |
| `{"signer":"decentraland-kernel-scene"}` | unchanged | verifies; reads canonical |
| `{"signer":"Decentraland-Kernel-Scene"}` | unchanged | **verifies**; reads `Decentraland-Kernel-Scene` |
| `{"signer":" decentraland-kernel-scene"}` | unchanged | **verifies**; reads padded |
| `{}` | unchanged | verifies; reads `undefined` |
| `{"signer":"decentraland-kernel-scene"}` | `{"Signer":...}` | `401 Invalid signature` |

Canonical form is therefore a client-side contract rather than something this library enforces. **If your service compares a reserved field by strict equality — `metadata.signer !== 'decentraland-kernel-scene'` — enforce the canonical form yourself in `metadataValidator`.** It runs before signature verification, so it costs nothing:

```ts
import { rejectIfSigner } from '@dcl/crypto-middleware'

// refuses a non-canonical `signer` instead of comparing it, so the gate stays meaningful
wellKnownComponents({ metadataValidator: rejectIfSigner('decentraland-kernel-scene') })
```

See [Composable metadata validators](#composable-metadata-validators) for `requireSigner` and `requireCanonicalField`.

The same applies to any other field your service authorizes on.

### From `decentraland-crypto-middleware`

- Rename `verifyMetadataContent` → `metadataValidator`.
- Default catalyst changed from `peer-lb.decentraland.org` to `peer.decentraland.org`.
- The middleware runs expiration checks before calling the catalyst; expired signatures fail faster.

### From `@dcl/platform-crypto-middleware`

- `fetcher` is now optional — defaults to the global `fetch`.
- Metadata validation error is now `Invalid metadata content: <json>` (was `Invalid metadata`).
- The Express and Koa adapters have been removed; use `wellKnownComponents`.
- **Behavior change:** the signed payload no longer lowercases the metadata — see [From 5.x](#from-5x-breaking-signed-payload-format) below, which applies to you too.
