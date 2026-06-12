---
'@dcl/http-commons': major
---

Type the HTTP handlers/middleware against `@dcl/core-commons`' native-fetch `IHttpServerComponent` instead of `@well-known-components/interfaces`, so they can be used with `@dcl/http-server` v2 without casts. `HTTPResponseError` now wraps the native (undici) `Response`, and the `node-fetch` dependency is dropped.

BREAKING CHANGE: consumers must run the native-fetch HTTP server (`@dcl/http-server` v2 / `@dcl/core-commons`). Services still on the node-fetch-based `@well-known-components/http-server` should stay on `@dcl/http-commons@1.x`.
