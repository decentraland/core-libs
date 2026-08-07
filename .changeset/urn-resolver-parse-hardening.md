---
"@dcl/urn-resolver": patch
---

harden `parseUrn` / `resolveUrlFromUrn` against malformed and malicious input. `parseUrn` now returns `null` instead of throwing on non-URL input (`''`, `not-a-url`, `::::`), on malformed percent-escapes (e.g. `%GG`, previously a `URIError`), and on invalid/out-of-bounds `LAND` positions (e.g. `LAND:foo` or coordinates outside the valid range, previously a `BigInt` `SyntaxError` / bounds `Error`). The entity resolver now validates the `baseUrl` query parameter (only `http:`/`https:` URLs are honored — `javascript:`, `data:`, and malformed values are rejected) and the `cid` (rejects path-traversal payloads such as `..%2f..%2f`), so `resolveUrlFromUrn` can no longer emit attacker-controlled or non-HTTP URLs. Also makes the collections-v1 by-name network check case-insensitive and rejects non-integer parcel coordinates instead of silently coercing them.
