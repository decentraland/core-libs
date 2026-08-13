---
"@dcl/content-validator": minor
---

Require a profile avatar's `userId` and `ethAddress` to match the entity pointer. `createPointerValidateFn` now rejects a deployment whose avatar identity names an address other than the pointer, reporting which field disagrees.

Previously these fields were only checked for shape: `@dcl/schemas` requires `ethAddress` to look like an address and does not list `userId` in the schema's `required` set, while the pointer validation compared the pointer against the auth-chain signer and left the avatar metadata alone. Consumers of the profile endpoints treat those fields as the address of the profile, so a deployment could produce a profile whose stored identity disagreed with the pointer it was served under.

Only fields that are present are compared, so omitting `userId` keeps working, and the comparison is case-insensitive so checksummed values pass. Default profiles are exempt: their pointer is a name (`default10`) rather than an address, and their metadata legitimately carries the Decentraland deployer address.

The rule is gated on the new `PROFILE_IDENTITY_TIMESTAMP` export, which defaults to the current time and is overridable through the environment like the existing ADR timestamps. The rule therefore applies to deployments made from start-up on, while profiles deployed before it keep validating — this matters when a node re-validates historical content while bootstrapping, since a large amount of existing profiles predate the rule.

New deployments cannot be dated before the cutoff to avoid the check: the catalyst bounds a submitted `entity.timestamp` to `REQUEST_TTL_BACKWARDS` (20 minutes by default) behind wall-clock, so any freshly submitted deployment falls after the cutoff of a node that has been up longer than that.

Set `PROFILE_IDENTITY_TIMESTAMP` explicitly to pin the cutoff to a fixed point. Because the default is resolved per process, nodes that started at different times disagree on how far back the rule reaches, which only affects re-validation of pre-existing content: a node that started more recently accepts older mismatched profiles that a longer-running one rejects. Pinning the value makes that uniform across a fleet.
