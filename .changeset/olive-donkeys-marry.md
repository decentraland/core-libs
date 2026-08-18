---
'@dcl/crypto-middleware': minor
---

Add composable `metadataValidator` predicates: `rejectIfSigner`, `requireSigner` and `canonicalField`.

Since 6.0.0 the library canonicalizes nothing — metadata reaches the validator exactly as the client signed it. Services identify the caller by comparing a field for equality, so a value differing only in case or padding fails that comparison and reads as something the request is not. Every service was about to hand-roll the same guard against that.

```ts
wellKnownComponents({ metadataValidator: rejectIfSigner('decentraland-kernel-scene') })
wellKnownComponents({ metadataValidator: requireSigner('decentraland-kernel-scene', 'dcl:authoritative-server') })
```

Both reject a non-canonical `signer` rather than folding it, so the comparison that follows is meaningful and no value is silently rewritten. `rejectIfSigner` passes when `signer` is absent; `requireSigner` fails closed on absent, non-canonical, or unlisted. Both throw at construction if given a non-canonical value, so a predicate that could never fire is a startup error rather than a quiet authorization gap.

`canonicalField(name)` is the underlying primitive, for fields without a dedicated helper:

```ts
metadataValidator: (m) => canonicalField('intent')(m) && m.intent === 'dcl:explorer:comms-handshake'
```

Additive: the library still holds no opinion about which fields exist or what they mean, and nothing runs unless a service composes it in.
