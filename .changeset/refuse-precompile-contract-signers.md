---
'@dcl/crypto': minor
'@dcl/crypto-middleware': minor
---

Treat the zero address and the precompile range as not contract wallets, and require the full ERC-1271 return word.

`@dcl/crypto` adds `isReservedAddress` (also on `Authenticator`), true for `0x0000…0000` through `0x0000…00ff`. EIP-1654 validation now refuses a signer or delegated address in that range without making an RPC call. A contract's `isValidSignature` result is now decoded as a 32-byte word and accepted only when it is exactly `0x1626ba7e` followed by 28 zero bytes, instead of reading just the first 4 bytes.

`isValidEIP1271Signature` is exported and takes a caller-supplied validator. Such a validator must now resolve to the whole 32-byte return word; one built with a `bytes4` output resolves to 4 bytes and no longer validates.

`@dcl/crypto-middleware` refuses an EIP-1654 chain whose signer is in the reserved range with `401 Invalid signature` before asking the catalyst. The catalyst's own decoding of the return word is outside this package.
