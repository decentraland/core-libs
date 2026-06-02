# @dcl/single-sign-on-client

## 3.0.1

### Patch Changes

- 5bc1e8d: Add `repository` metadata to package.json so npm provenance validation passes when publishing via OIDC Trusted Publishing.

## 3.0.0

### Major Changes

- 67eaa51: Add `@dcl/single-sign-on-client` to the `core-libs` monorepo as a `localStorage`-backed identity store, dropping the hidden SSO iframe entirely. This redesign supersedes the previously published `2.0.0` and releases as the next major (`3.0.0`).

  **Breaking changes** (vs. the published `2.0.0`):

  - Replaces the `SingleSignOn` singleton/class (`SingleSignOn.getInstance()`, `init({ src })`) with standalone functions. There is nothing to initialize — delete any `getInstance`/`init` calls.
  - Removes the Single Sign On iframe/webapp integration entirely. Everything operates on the consuming application's own `localStorage`, so the identity is scoped to the current origin and is **no longer shared across Decentraland domains**.
  - Removes connection-data handling (`getConnectionData` / `setConnectionData`); the library now only stores the auth identity.
  - Identity API: `getIdentity`, `storeIdentity` and `clearIdentity` are the public surface. They read/write `localStorage` directly and are **synchronous** (they no longer return Promises). `await` on the results still works, but `.then(...)` usage must be updated. Clearing is now an explicit `clearIdentity(user)` rather than `setIdentity(user, null)`.
  - Drops the `validator` dependency; the sole runtime dependency is `@dcl/crypto` (for the `AuthIdentity` type).

  **Drop-in for `0.1.x` consumers.** Every current consumer (e.g. `decentraland-dapps`, `marketplace`, `builder`, `account`, `profile`, `explorer-website`, `unity-renderer`) imports the synchronous `localStorageGetIdentity` / `localStorageStoreIdentity` / `localStorageClearIdentity` helpers and never used `init` or the iframe round-trip. Those names are still exported as aliases of `getIdentity` / `storeIdentity` / `clearIdentity` and behave identically, so upgrading from `0.1.x` requires no code changes — just bump the version range.
