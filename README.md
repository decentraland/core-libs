# Core Libraries

A monorepo of reusable core libraries for the DCL ecosystem, managed with pnpm workspaces.

## Libraries

All packages live in `libs/` and are published to npm.

| Package | Directory | Description |
| --- | --- | --- |
| `@dcl/http-commons` | `http-commons` | Middlewares and utilities for HTTP servers |
| `@dcl/crypto` | `crypto` | Crypto auth primitives: `Authenticator`, signature validation, auth-chain helpers |
| `@dcl/crypto-middleware` | `crypto-middleware` | Auth middleware for signed requests, with Express, Koa and Well-Known Components adapters |
| `decentraland-crypto-fetch` | `crypto-fetch` | `fetch` wrapper that signs requests with a Decentraland Identity |
| `@dcl/hashing` | `hashing` | Hashing functions for Decentraland Content Identifiers |
| `@dcl/content-validator` | `content-validator` | Catalyst content validations for deployments |
| `@dcl/urn-resolver` | `urn-resolver` | URN resolver for Decentraland assets |
| `@dcl/single-sign-on-client` | `single-sign-on-client` | `localStorage`-backed identity store, scoped to the current origin |

Each package has its own README with usage details.

## Development

Requires Node.js >= 24 and pnpm >= 11.

```bash
pnpm install
pnpm build     # build all packages
pnpm test      # test all packages
pnpm lint      # lint all packages
pnpm dev       # watch mode
pnpm clean     # remove build artifacts
```

To work on one package: `cd libs/<name> && pnpm test`.

Packages build to dual ESM (`.mjs`) and CommonJS (`.js`) output behind an `exports` map.

## Configuration

Shared configuration lives at the repo root and is extended per package:

- `tsconfig.base.json` — TypeScript settings (strict, ES2024)
- `jest.preset.js` — Jest + ts-jest setup
- `eslint.config.js` — ESLint flat config for the whole workspace

## Publishing

Version management and npm publishing use [Changesets](https://github.com/changesets/changesets).
Every PR that changes a package **must** include a changeset — CI enforces this.

1. Run `pnpm changeset`, select the changed packages, pick the bump type (major/minor/patch),
   and write a summary. This writes a file to `.changeset/`.
2. Commit that file with your PR.
3. On merge, CI opens a "Version Packages" PR with updated versions and generated changelogs.
4. Merging that PR builds and publishes to npm, creates git tags, and generates GitHub releases.
