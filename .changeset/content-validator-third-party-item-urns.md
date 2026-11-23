---
"@dcl/content-validator": minor
---

Require third-party wearables and emotes in profiles and outfits to be linked to an NFT. A third-party URN that names no NFT (`urn:decentraland:<network>:collections-thirdparty:<provider>[:<collection>[:<item>]]`) is now rejected with an error asking for the NFT network, contract and token id, the same way collection assets without a token id are rejected since ADR-244.

Ownership of those URNs could not be checked, so they were accepted as owned. The rule is gated on the new `THIRD_PARTY_ITEM_URN_TIMESTAMP` export, set to `2026-12-01T00:00:00Z` and overridable through the environment like the existing ADR timestamps, so historical deployments keep validating.
