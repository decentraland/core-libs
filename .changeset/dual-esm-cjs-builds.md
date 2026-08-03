---
'@dcl/content-validator': major
'@dcl/crypto': major
'@dcl/crypto-middleware': major
'@dcl/hashing': major
'@dcl/http-commons': major
'@dcl/single-sign-on-client': major
'@dcl/urn-resolver': major
'decentraland-crypto-fetch': major
---

Ship dual ESM/CJS builds and require Node >= 24

Every package now publishes both an ESM (`.mjs`) and a CommonJS (`.js`) build behind
an `exports` map, matching the layout `@dcl/hashing` already used:

```json
"exports": { ".": { "types": "...", "import": "...mjs", "require": "...js" } }
```

**Breaking changes**

- `engines.node` is now `>=24` (was `>=22`). The ESM-only `@noble/*` v2 dependencies
  rely on Node's `require(esm)` support, which is not present before 22.12.
- JS output is bundled per entry point, so `dist/` no longer mirrors the `src/` tree.
  Type declarations are still emitted per file.
- The `exports` map means deep imports into `dist/` are no longer resolvable. Because
  the previous build emitted one JS file per module with no `exports` map, *every*
  module was incidentally importable via `@dcl/<pkg>/dist/...`. Only the paths below
  were documented; the rest were never public API and are now internal:
  - `@dcl/content-validator/dist/validations/access/{on-chain,subgraph}[/...]` — the four
    documented access-checker factories (`createOnChainAccessCheckValidateFns`,
    `createOnChainClient`, `createSubgraphAccessCheckValidateFns`, `createTheGraphClient`)
    are now exported from the package root. Import them from `@dcl/content-validator`.
  - `@dcl/crypto/dist/crypto` — now the supported subpath `@dcl/crypto/crypto`, with a
    `typesVersions` entry so it also resolves under `moduleResolution: node`.

  If you relied on any other `dist/` path, open an issue — it can be re-exported.
- `@dcl/crypto` no longer depends on `eth-connect`. The handful of helpers it used are now
  implemented in-package from their public specifications:
  - `src/eth/hex.ts` — `isHex`, `hexToBytes`, `getAddress` (EIP-55 checksum) and RPC
    quantity coercion.
  - `src/eth/rpc.ts` — a minimal JSON-RPC client covering the only three calls this package
    makes (`eth_blockNumber`, `eth_getBlockByNumber`, `eth_call`). It accepts the same
    provider shapes as before: EIP-1193 `request()`, plus callback- and promise-style
    `sendAsync()`/`send()`, so existing providers keep working.
  - `src/contracts/SignatureValidator.ts` — direct ABI encoding of the single
    `isValidSignature(bytes32,bytes)` call, replacing the generic contract factory.

  `eth-connect` stays a devDependency purely so its originals can be differentially tested
  against the replacements. Nothing is copied from it, and it is absent from the published
  artifact — which also removes the LGPL-3.0/Apache-2.0 question that bundling raised.
  `@dcl/crypto`'s published output drops from roughly 567 KB to 63 KB.
- Every package now ships the Apache-2.0 `LICENSE` in its published tarball. Previously
  only the repository root carried it, so none of the published artifacts included their
  own licence text.
