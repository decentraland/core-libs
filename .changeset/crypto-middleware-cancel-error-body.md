---
"@dcl/crypto-middleware": patch
---

release the catalyst response body on the error path. `verifyEIP1654Sign` threw on a non-2xx catalyst response without consuming the body, leaving an unconsumed undici response that pins its socket and buffers its bytes until GC. The body is now cancelled (without being read, so the rejection stays independent of body content) before throwing. Only contract-wallet (EIP-1271/1654) auth chains hitting catalyst errors reach this path.
