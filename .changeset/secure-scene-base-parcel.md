---
'@dcl/content-validator': major
---

Upgrade the public runtime and type dependency to `@dcl/schemas@27` and reject scene deployments unless their base,
scene parcels, and entity pointers form the same unique canonical parcel identity.

This validation is intentionally timestamp-independent: historical and backfilled deployments with an invalid scene
identity are rejected during replay as well as new deployments. Consumers must explicitly adopt this major release and
handle or quarantine any legacy deployment that does not satisfy the integrity invariant.
