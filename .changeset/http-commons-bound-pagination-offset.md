---
"@dcl/http-commons": patch
---

Bound `offset` in `getPaginationParams` the way `limit` already is, capping it at 100,000.

The function clamped `limit` to 100 but accepted any non-negative `offset`, and the value reaches the database verbatim. Two consequences. `parseInt` happily returns a number beyond the range of a `bigint`, so `?offset=9223372036854775808` produced `ERROR: bigint out of range` from Postgres — a 500 on a request the library had already decided was valid. Below that, a deep offset still makes the engine walk and discard every skipped row, which is a cheap way to turn one request into a large scan on any listing endpoint.

The cap follows the same shape as the limit one: the value is reduced rather than rejected, so no caller starts receiving errors. At the maximum page size 100,000 is page one thousand, past anything a client pages to — but note that a caller who asked to skip further now receives an earlier page rather than an error, which is the same trade the limit clamp already makes.
