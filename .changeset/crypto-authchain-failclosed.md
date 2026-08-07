---
"@dcl/crypto": patch
---

`isValidAuthChain` now returns `false` for an empty chain (previously `true`, which let `validateSignature('', [], provider)` resolve `{ ok: true }`), and unrecognized auth-link types now fail closed cleanly: the internal `ERROR_VALIDATOR` throws instead of returning an ignored error object that silently reset the authority and let validation continue. `validateSignature` still never throws to its caller — an unknown link type resolves to `{ ok: false, message: 'ERROR. Link type: <type>. Unknown auth link type.' }`.
