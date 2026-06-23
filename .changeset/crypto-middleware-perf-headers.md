---
"@dcl/crypto-middleware": patch
---

performance: the well-known-components adapter now reads only the auth-related headers (chain links, timestamp, metadata) from the native `Headers` instead of materializing the entire header set into a plain object on every request, and `verify` reads the timestamp/metadata headers once rather than twice.
