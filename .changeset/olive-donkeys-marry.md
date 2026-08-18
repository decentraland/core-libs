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

`requireCanonicalField(field, ...values)` does the same for any other field — `intent` is gated in two services:

```ts
metadataValidator: requireCanonicalField('intent', 'dcl:explorer:comms-handshake')
```

`canonicalField(name)` is the form-only primitive underneath, for when you are not comparing the value.

All four read fields as own properties. A plain `m.field` read walks the prototype chain, so a polluted `Object.prototype` could otherwise satisfy an equality check with a value no client sent.

Additive: the library still holds no opinion about which fields exist or what they mean, and nothing runs unless a service composes it in.
