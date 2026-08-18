# decentraland-crypto-fetch

## 3.0.0

### Major Changes

- 32db4de: Match the signed payload format to `@dcl/crypto-middleware` 6.

  `signedHeaderFactory` now lowercases only the method, path and timestamp and joins the metadata verbatim, instead of lowercasing the whole payload. Metadata casing is therefore covered by the signature: the property names and values that arrive are the ones that were signed, and a service reading `authMetadata` gets them case-intact.

  This is the same wire-format change as `@dcl/crypto-middleware` 6 and must ship with it. A service on the previous middleware will reject headers produced by this version, and vice versa, for any request whose metadata contains an uppercase character.

## 2.0.0

### Major Changes

- 08cb29d: Migrate `decentraland-crypto-fetch` into the `core-libs` monorepo. Drops the `core-js-pure` global-this polyfill (Node 22+ provides `globalThis`, `fetch`, `Headers`, `Request` and `URL` natively) and the `bin/fetch.ts` CLI. The public API (`signedFetchFactory`, `signedHeaderFactory`, default signed fetch, `SignedRequestInit`, `SignedRequestInfo`, `Metadata`, `AuthIdentity`) is preserved.

### Patch Changes

- 504f5a4: Wire up `@dcl/eslint-config/core-services` across all libs and address every error it surfaced. Replaces `any` with precise types or `unknown` (e.g. `Metadata`, `Record<string, any>` → `Record<string, unknown>`, options bag types), drops forbidden non-null assertions in `@dcl/crypto`'s `Blocks` helper and EIP-1654 validators, converts the `Authenticator` namespace to a const-object (preserves the existing `import { Authenticator }` consumer surface), and adds explicit return types to public functions. Public runtime behavior is unchanged; some public type signatures are narrowed (e.g. `Record<string, any>` → `Record<string, unknown>`) which may require minor adjustments in strict downstream TypeScript code.
- Updated dependencies [7b6f53e]
- Updated dependencies [504f5a4]
- Updated dependencies [504f5a4]
  - @dcl/crypto@3.7.0
