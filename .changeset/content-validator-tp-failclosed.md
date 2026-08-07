---
"@dcl/content-validator": patch
---

security and robustness fixes:

- **Behavior change (fail closed):** the subgraph access checker now rejects third-party wearable/emote ownership instead of silently skipping it. Previously `ownsItemsAtTimestamp` discarded the third-party URN buckets returned by `splitItemsURNsByTypeAndNetwork`, so a profile/outfit referencing an unowned third-party item passed ownership validation on the subgraph path. The subgraph checker has no way to verify third-party ownership (only the on-chain checker does), so any third-party URN now fails validation. **Consumers that deploy profiles/outfits referencing third-party items must use the on-chain access checker.**
- `sanitizeUrn` in the common profile/outfits access checks now uses `safeParseUrn`, so a malformed `dcl://` URN no longer throws out of the validator as an unhandled rejection.
- the metadata-schema validation now returns a validation failure for an unknown entity type instead of throwing a `TypeError`.
- an emote deployed exactly at `ADR_74_TIMESTAMP` is now validated against ADR-74 (the ADR match is inclusive at the boundary, consistent with `validateAfterADR74`) instead of being rejected.
- scene pointer coordinates are parsed strictly, so a malformed pointer like `10abc,20` is rejected instead of being coerced to `(10, 20)`.
