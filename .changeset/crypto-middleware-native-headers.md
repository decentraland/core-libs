---
'@dcl/crypto-middleware': patch
---

Make the `wellKnownComponents` adapter work with the native-fetch HTTP server. It read auth headers via the node-fetch-only `Headers.raw()`, which throws on the native (undici) `Headers` used by `@dcl/http-server` v2. It now builds the plain header map with `Headers.entries()`, which works on both node-fetch and native `Headers` (single-valued auth headers are unaffected, as `verify()` normalizes each value).
