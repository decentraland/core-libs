---
'@dcl/crypto-middleware': minor
---

Add `canonicalMetadataKeys`, an opt-in way to verify requests still signed with the pre-6.0.0 format.

6.0.0 is a wire-format change, which normally means callers ship before the service. Some services cannot be sequenced that way: an explorer fleet is three separate client releases, and none of them can be deployed atomically with a service. Those services otherwise have no order that avoids breaking their callers.

```ts
wellKnownComponents({
  metadataValidator: rejectIfSigner('decentraland-kernel-scene'),
  canonicalMetadataKeys: ['signer', 'intent', 'sceneId', 'realm.serverName']
})
```

The current format is tried first; only a signature mismatch falls through. Before accepting a legacy request, every declared key must be delivered in exactly that spelling — the legacy payload folds the metadata, so `{"Signer":...}` otherwise shares a valid signature with `{"signer":...}` and reads as absent to a service comparing `metadata.signer`. The ambiguity is refused, never resolved, so nothing is rewritten and `authMetadata` still holds what the client sent.

A field delivered under two spellings at once is refused as ambiguous even when one is canonical, since which the service reads would otherwise depend on key order. The list doubles as the switch: there is no way to accept the legacy payload without naming the fields that make doing so safe. It is validated at the start of every call and at runtime rather than by types alone, so a misconfigured rollout fails immediately. Values stay the job of `metadataValidator`, which runs on both paths.

Absent by default. Remove the option once the callers have migrated.
