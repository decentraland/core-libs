# decentraland-crypto-fetch

## 2.0.0

### Major Changes

- 08cb29d: Migrate `decentraland-crypto-fetch` into the `core-libs` monorepo. Drops the `core-js-pure` global-this polyfill (Node 22+ provides `globalThis`, `fetch`, `Headers`, `Request` and `URL` natively) and the `bin/fetch.ts` CLI. The public API (`signedFetchFactory`, `signedHeaderFactory`, default signed fetch, `SignedRequestInit`, `SignedRequestInfo`, `Metadata`, `AuthIdentity`) is preserved.

### Patch Changes

- 504f5a4: Wire up `@dcl/eslint-config/core-services` across all libs and address every error it surfaced. Replaces `any` with precise types or `unknown` (e.g. `Metadata`, `Record<string, any>` → `Record<string, unknown>`, options bag types), drops forbidden non-null assertions in `@dcl/crypto`'s `Blocks` helper and EIP-1654 validators, converts the `Authenticator` namespace to a const-object (preserves the existing `import { Authenticator }` consumer surface), and adds explicit return types to public functions. Public runtime behavior is unchanged; some public type signatures are narrowed (e.g. `Record<string, any>` → `Record<string, unknown>`) which may require minor adjustments in strict downstream TypeScript code.
- Updated dependencies [7b6f53e]
- Updated dependencies [504f5a4]
- Updated dependencies [504f5a4]
  - @dcl/crypto@3.7.0
