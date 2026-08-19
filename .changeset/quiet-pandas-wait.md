---
'@dcl/crypto-middleware': minor
---

Add `acceptLegacyPayload`, an opt-in way to verify requests still signed with the pre-6.0.0 format.

6.0.0 is a wire-format change, which normally means callers ship before the service. Some services cannot be sequenced that way: an explorer fleet is three separate client releases, and none of them can be deployed atomically with a service. Those services otherwise have no order that avoids breaking their callers.

```ts
wellKnownComponents({
  metadataValidator: rejectIfSigner('decentraland-kernel-scene'),
  acceptLegacyPayload: { canonicalMetadataKeys: ['signer', 'intent', 'sceneId', 'realm.serverName'] }
})
```

The current format is tried first; only a signature mismatch falls through. Before accepting a legacy request, every declared key must be delivered in exactly that spelling — the legacy payload folds the metadata, so `{"Signer":...}` otherwise shares a valid signature with `{"signer":...}` and reads as absent to a service comparing `metadata.signer`. The ambiguity is refused, never resolved, so nothing is rewritten and `authMetadata` still holds what the client sent.

`canonicalMetadataKeys` must be non-empty — enabling this without naming the fields the service authorizes on would accept metadata nothing binds, so it throws rather than defaulting. Values stay the job of `metadataValidator`, which runs on both paths.

Absent by default. `onAccepted` fires on every legacy acceptance so you can tell when the callers have migrated and the option can be removed.
