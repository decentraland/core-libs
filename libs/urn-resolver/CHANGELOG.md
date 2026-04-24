# @dcl/urn-resolver

## 1.0.1

### Patch Changes

- 8344098: Migrate `@dcl/urn-resolver` from the standalone `urn-resolver` repository into the `core-libs` monorepo. The package source, tests and public API are unchanged — downstream consumers should see no behavioural differences.
- 8344098: Improve parser throughput: route regexes are now compiled once at `createParser` time instead of being rebuilt on every `parseUrn` call, and `getCollection` now does an O(1) lookup against two pre-built `Map`s instead of an O(n) scan over the full collections-v1 list. A stray `console.log` in the contract lookup path is also removed. The public API and all existing behaviour are unchanged.
