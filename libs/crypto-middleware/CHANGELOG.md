# @dcl/crypto-middleware

## 6.0.0

### Major Changes

- 32db4de: Bind the metadata bytes into the signed payload instead of lowercasing them.

  `createPayload` now lowercases only the method, path and timestamp and joins the raw metadata string. Previously the whole payload was lowercased, which left metadata casing outside the signature: `{"Signer":...}` and `{"signer":...}` produced byte-identical payloads, so a rewritten property name kept a valid signature while reading as absent to a consumer gating on the exact key. The same rewrite defeated consumer-defined fields such as `sceneId`, `parcel` and `isGuest`.

  This is a wire-format change: signers and verifiers must be upgraded together. A client signing the old payload now fails with `401 Invalid signature` on any request whose metadata contains an uppercase character.

  Also removes the canonical `signer` / `intent` value check added in 5.1.0. `verifyMetadata` now returns the parsed metadata untouched, and the signature covers casing only against changes made _after_ signing: a client that signs `{"signer":"Decentraland-Kernel-Scene"}`, or a whitespace-padded value, verifies successfully and the handler receives it as sent — where 5.1.0 rejected it with a `400`. Services comparing reserved fields by strict equality should enforce the canonical form in `metadataValidator`, which runs before signature verification.

## 5.1.0

### Minor Changes

- 05755fe: Require `metadata.signer` and `metadata.intent` to arrive already trimmed and lowercased.

  Signed-fetch payloads are lowercased before they are signed, so the signature binds only the lowercased bytes, while
  `verify()` exposes metadata to consumers using the representation received in the request. A mixed-case value therefore
  carries the _same valid signature_ as its canonical form, and a TLS-terminating intermediary can flip case on an intercepted
  request without invalidating it. Services identify the caller by strict equality on these fields
  (`signer === 'decentraland-kernel-scene'`, `signer === 'dcl:explorer'`, `intent === 'dcl:explorer:comms-handshake'`), so such
  a request misses that check and is read as a directly user-signed — more trusted — request. `verifyMetadata` now requires
  `value === value.trim().toLowerCase()` for the top-level `signer` and `intent` fields, closing that escalation.

  ```json
  // rejected
  { "signer": "Decentraland-Kernel-Scene" }
  { "signer": " decentraland-kernel-scene" }
  // must be sent as
  { "signer": "decentraland-kernel-scene" }
  ```

  The trim half of the rule guards something different from the casing half, and is worth calling out. Whitespace _is_
  signature-bound — the payload is never trimmed, so padding changes the signed bytes and no third party can add or strip it on
  an intercepted request. Padded values are rejected to prevent a silent misclassification instead: `" dcl:explorer"` signs and
  verifies perfectly well, then misses the consumer's strict equality check and is quietly promoted to the more trusted path. A
  `400` is the better failure.

  The validation runs on the raw metadata before payload construction, before signature verification, and before any
  consumer-provided `metadataValidator` — so it cannot be bypassed, and it costs no catalyst round-trip. Invalid values are
  rejected with the existing metadata validation error, `400 Invalid chain metadata: "<raw metadata>"`, intentionally reusing
  that error surface rather than adding a new one.

  Hex addresses matching `^0x[a-fA-F0-9]{40}$` are exempt from lowercase enforcement, because EIP-55 checksum casing may be
  meaningful and re-casing hex cannot change which address a value denotes. That pattern is anchored, with two consequences: the
  `0x` prefix itself must remain lowercase, consistent with `EthAddress.schema.pattern` in `@dcl/schemas`; and a padded address
  is still rejected.

  The change is deliberately narrow:

  - Only top-level string values for `signer` and `intent` are validated.
  - Nested metadata is not recursively inspected.
  - Values are rejected rather than normalized.
  - All other metadata fields, including `sceneId`, `realmName`, `realm.serverName` and `origin`, are unchanged — those can
    legitimately be mixed case.

  Consumers that require canonical formatting for additional metadata fields should enforce those constraints through their own
  `metadataValidator`. Under `{ optional: true }`, this behaves like any other verification failure and falls through as an
  unauthenticated request rather than a rejection.

  **Compatibility note:** clients currently sending mixed-case or whitespace-padded `signer` or `intent` values will receive a
  `400` response after upgrading. Confirm that senders emit both fields lowercase and unpadded before adopting this version.

## 5.0.0

### Major Changes

- ac6204c: Drop the Express and Koa middlewares; only the Well-Known Components middleware (`wellKnownComponents`) remains. This removes the optional `express` and `koa` peer dependencies and their `.d.ts` type references, so consumers no longer need `skipLibCheck` to build against this package.

## 4.1.1

### Patch Changes

- ef92819: release the catalyst response body on the error path. `verifyEIP1654Sign` threw on a non-2xx catalyst response without consuming the body, leaving an unconsumed undici response that pins its socket and buffers its bytes until GC. The body is now cancelled (without being read, so the rejection stays independent of body content) before throwing. Only contract-wallet (EIP-1271/1654) auth chains hitting catalyst errors reach this path.
- ef92819: performance: the well-known-components adapter now reads only the auth-related headers (chain links, timestamp, metadata) from the native `Headers` instead of materializing the entire header set into a plain object on every request, and `verify` reads the timestamp/metadata headers once rather than twice.

## 4.1.0

### Minor Changes

- 1a9fc13: Accept an explicit `null` metadata header by treating it as empty metadata (`{}`) instead of rejecting the request with a 400.

  This restores compatibility with clients built against `@dcl/platform-crypto-middleware`, which returned `null` as-is. `authMetadata` is still guaranteed to be a safe object to dereference, and non-object metadata (primitives, arrays) continues to be rejected with a 400.

## 4.0.0

### Major Changes

- 1603d0b: Remove the Passport strategy adapter.

  The `passport()` factory and the `DecentralandStrategy` class are no longer exported, and the optional `passport-strategy` peer dependency has been dropped. The Express, Koa, and Well-Known Components adapters remain unchanged.

  BREAKING CHANGE: `passport()` and `DecentralandStrategy` are no longer part of the public API. Consumers using the Passport adapter should switch to the `express`, `koa`, or `wellKnownComponents` middleware.

## 3.0.0

### Major Changes

- d79a570: Type the `wellKnownComponents` middleware and the `fetcher` option against `@dcl/core-commons` instead of `@well-known-components/interfaces`.

  The runtime already targeted `@dcl/http-server` v2 (native/undici `Headers` via `.entries()`), but the static types still bound the request context and `fetcher` to `node-fetch`'s `Request`/`IFetchComponent`. That mismatch forced consumers pairing this with `@dcl/http-server` to bridge with `as unknown as` casts. The handler context and `fetcher` now use the native (undici) types from `@dcl/core-commons`, so no casts are needed. `@dcl/core-commons` replaces the direct `@well-known-components/interfaces` dependency.

  BREAKING CHANGE: `wellKnownComponents` and `VerifyAuthChainHeadersOptions['fetcher']` are now typed against `@dcl/core-commons` (native `Request`/`IFetchComponent`) rather than `@well-known-components/interfaces` (node-fetch). Consumers still pairing this with a `node-fetch`-typed HTTP server / fetch component will see type errors. Mirrors the same change made to `@dcl/http-commons`.

## 2.0.1

### Patch Changes

- 79eae87: Make the `wellKnownComponents` adapter work with the native-fetch HTTP server. It read auth headers via the node-fetch-only `Headers.raw()`, which throws on the native (undici) `Headers` used by `@dcl/http-server` v2. It now builds the plain header map with `Headers.entries()`, which works on both node-fetch and native `Headers` (single-valued auth headers are unaffected, as `verify()` normalizes each value).

## 2.0.0

### Major Changes

- e2b45a0: Initial release of `@dcl/crypto-middleware`, a consolidation of `decentraland-crypto-middleware` and `@dcl/platform-crypto-middleware`. Exposes Express, Koa, Passport, and Well-Known Components adapters; uses the Node 22+ global `fetch` with an optional `IFetchComponent` injection; validates the catalyst response shape; runs expiration checks before contacting the catalyst.

### Minor Changes

- 504f5a4: Wire up `@dcl/eslint-config/core-services` across all libs and address every error it surfaced. Replaces `any` with precise types or `unknown` (e.g. `Metadata`, `Record<string, any>` → `Record<string, unknown>`, options bag types), drops forbidden non-null assertions in `@dcl/crypto`'s `Blocks` helper and EIP-1654 validators, converts the `Authenticator` namespace to a const-object (preserves the existing `import { Authenticator }` consumer surface), and adds explicit return types to public functions. Public runtime behavior is unchanged; some public type signatures are narrowed (e.g. `Record<string, any>` → `Record<string, unknown>`) which may require minor adjustments in strict downstream TypeScript code.

### Patch Changes

- 7b6f53e: Migrate `@dcl/crypto` from the standalone `decentraland-crypto` repository into the `core-libs` monorepo. The package source, tests and public API are unchanged — downstream consumers should see no behavioural differences. `@dcl/crypto-middleware` now consumes `@dcl/crypto` as an internal workspace dependency.
- Updated dependencies [7b6f53e]
- Updated dependencies [504f5a4]
- Updated dependencies [504f5a4]
  - @dcl/crypto@3.7.0
