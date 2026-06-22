---
"@dcl/crypto-middleware": minor
---

Accept an explicit `null` metadata header by treating it as empty metadata (`{}`) instead of rejecting the request with a 400.

This restores compatibility with clients built against `@dcl/platform-crypto-middleware`, which returned `null` as-is. `authMetadata` is still guaranteed to be a safe object to dereference, and non-object metadata (primitives, arrays) continues to be rejected with a 400.
