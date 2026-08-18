---
'@dcl/crypto-middleware': major
---

Bind the metadata bytes into the signed payload instead of lowercasing them.

`createPayload` now lowercases only the method, path and timestamp and joins the raw metadata string. Previously the whole payload was lowercased, which left metadata casing outside the signature: `{"Signer":...}` and `{"signer":...}` produced byte-identical payloads, so a rewritten property name kept a valid signature while reading as absent to a consumer gating on the exact key. The same rewrite defeated consumer-defined fields such as `sceneId`, `parcel` and `isGuest`.

This is a wire-format change: signers and verifiers must be upgraded together. A client signing the old payload now fails with `401 Invalid signature` on any request whose metadata contains an uppercase character.

Also removes the canonical `signer` / `intent` value check added in 5.1.0. `verifyMetadata` now returns the parsed metadata untouched, and the signature covers casing only against changes made *after* signing: a client that signs `{"signer":"Decentraland-Kernel-Scene"}`, or a whitespace-padded value, verifies successfully and the handler receives it as sent — where 5.1.0 rejected it with a `400`. Services comparing reserved fields by strict equality should enforce the canonical form in `metadataValidator`, which runs before signature verification.
