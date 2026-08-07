---
'@dcl/crypto-middleware': minor
---

Require `metadata.signer` and `metadata.intent` to arrive already trimmed and lowercased.

Signed-fetch payloads are lowercased before they are signed, so the signature binds only the lowercased bytes, while
`verify()` exposes metadata to consumers using the representation received in the request. A mixed-case value therefore
carries the *same valid signature* as its canonical form, and a TLS-terminating intermediary can flip case on an intercepted
request without invalidating it. Services identify the caller by strict equality on these fields
(`signer === 'decentraland-kernel-scene'`, `signer === 'dcl:explorer'`, `intent === 'dcl:explorer:comms-handshake'`), so such
a request misses that check and is read as a directly user-signed — more trusted — request. `verifyMetadata` now requires
`value === value.trim().toLowerCase()` for the top-level `signer` and `intent` fields, closing that escalation.

```json
// rejected
{ "signer": "Decentraland-Kernel-Scene" }
{ "signer": " decentraland-kernel-scene" }
// must be sent as
{ "signer": "decentraland-kernel-scene" }
```

The trim half of the rule guards something different from the casing half, and is worth calling out. Whitespace *is*
signature-bound — the payload is never trimmed, so padding changes the signed bytes and no third party can add or strip it on
an intercepted request. Padded values are rejected to prevent a silent misclassification instead: `" dcl:explorer"` signs and
verifies perfectly well, then misses the consumer's strict equality check and is quietly promoted to the more trusted path. A
`400` is the better failure.

The validation runs on the raw metadata before payload construction, before signature verification, and before any
consumer-provided `metadataValidator` — so it cannot be bypassed, and it costs no catalyst round-trip. Invalid values are
rejected with the existing metadata validation error, `400 Invalid chain metadata: "<raw metadata>"`, intentionally reusing
that error surface rather than adding a new one.

Hex addresses matching `^0x[a-fA-F0-9]{40}$` are exempt from lowercase enforcement, because EIP-55 checksum casing may be
meaningful and re-casing hex cannot change which address a value denotes. That pattern is anchored, with two consequences: the
`0x` prefix itself must remain lowercase, consistent with `EthAddress.schema.pattern` in `@dcl/schemas`; and a padded address
is still rejected.

The change is deliberately narrow:

- Only top-level string values for `signer` and `intent` are validated.
- Nested metadata is not recursively inspected.
- Values are rejected rather than normalized.
- All other metadata fields, including `sceneId`, `realmName`, `realm.serverName` and `origin`, are unchanged — those can
  legitimately be mixed case.

Consumers that require canonical formatting for additional metadata fields should enforce those constraints through their own
`metadataValidator`. Under `{ optional: true }`, this behaves like any other verification failure and falls through as an
unauthenticated request rather than a rejection.

**Compatibility note:** clients currently sending mixed-case or whitespace-padded `signer` or `intent` values will receive a
`400` response after upgrading. Confirm that senders emit both fields lowercase and unpadded before adopting this version.
