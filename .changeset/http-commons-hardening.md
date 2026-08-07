---
"@dcl/http-commons": minor
---

security and robustness hardening:

- `parseJson` now accepts an optional `maxBytes` limit (default 10 MB) and rejects requests whose `content-length` exceeds it with a new `PayloadTooLargeError` (mapped to HTTP 413), guarding against unbounded body buffering. Note: an absent or spoofed `content-length` is not caught, so an upstream proxy body-size limit is still required.
- the error handler now logs the error name and full stack trace (server-side only, never leaked to the client) for 500s, which were previously logged as a single message with no stack.
- the bearer-token middleware now compares fixed-length SHA-256 digests with `timingSafeEqual` (removing the length-based short-circuit that leaked the secret's length via timing) and matches the `Bearer` scheme case-insensitively per RFC 7235.
- pagination parsing is now strict: values like `1e2` or `10abc` fall back to the default instead of being coerced to `1` / `10`.
- error classes now set `this.name` to the class name and capture stack traces consistently.
- the published package is now restricted to `dist` via a `files` allowlist and an `exports` map.
