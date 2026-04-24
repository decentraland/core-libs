---
"@dcl/urn-resolver": patch
---

Improve parser throughput: route regexes are now compiled once at `createParser` time instead of being rebuilt on every `parseUrn` call, and `getCollection` now does an O(1) lookup against two pre-built `Map`s instead of an O(n) scan over the full collections-v1 list. A stray `console.log` in the contract lookup path is also removed. The public API and all existing behaviour are unchanged.
