---
"@dcl/crypto-middleware": major
---

Remove the Passport strategy adapter.

The `passport()` factory and the `DecentralandStrategy` class are no longer exported, and the optional `passport-strategy` peer dependency has been dropped. The Express, Koa, and Well-Known Components adapters remain unchanged.

BREAKING CHANGE: `passport()` and `DecentralandStrategy` are no longer part of the public API. Consumers using the Passport adapter should switch to the `express`, `koa`, or `wellKnownComponents` middleware.
