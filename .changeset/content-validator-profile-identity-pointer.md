---
"@dcl/content-validator": minor
---

Require a profile avatar's `userId` and `ethAddress` to match the entity pointer. `createPointerValidateFn` now rejects a deployment whose avatar identity names an address other than the pointer, reporting which field disagrees.

Previously these fields were only checked for shape: `@dcl/schemas` requires `ethAddress` to look like an address and does not list `userId` in the schema's `required` set, while the pointer validation compared the pointer against the auth-chain signer and left the avatar metadata alone. Consumers of the profile endpoints treat those fields as the address of the profile, so a deployment could produce a profile whose stored identity disagreed with the pointer it was served under.

Only fields that are present are compared, so omitting `userId` keeps working, and the comparison is case-insensitive so checksummed values pass. Default profiles are exempt: their pointer is a name (`default10`) rather than an address, and their metadata legitimately carries the Decentraland deployer address.

The rule is gated on the new `PROFILE_IDENTITY_TIMESTAMP` export, defaulting to `2026-10-01T00:00:00Z` and overridable through the environment like the existing ADR timestamps. Deployments older than the cutoff keep validating, which matters when a node re-validates historical content while bootstrapping, since a large amount of existing profiles predate the rule. New deployments cannot be dated before the cutoff to avoid the check: the catalyst bounds a submitted `entity.timestamp` to `REQUEST_TTL_BACKWARDS` (20 minutes by default) behind wall-clock.
