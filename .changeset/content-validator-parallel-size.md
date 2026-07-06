---
"@dcl/content-validator": patch
---

feat: make deployment size-fetch concurrency configurable via `ExternalCalls.fetchContentFileSizeConcurrency`

`calculateDeploymentSize` awaited `externalCalls.fetchContentFileSize` one hash at a time, so validating a deployment whose content isn't in the uploaded files (e.g. a synced multi-file scene) performed N sequential storage round-trips. `ExternalCalls` now accepts an optional `fetchContentFileSizeConcurrency`: it **defaults to 1 (sequential — unchanged behavior)** and, when set higher, fetches the not-yet-uploaded sizes in bounded concurrent batches. The batching means even a large content list can't fan out into an unbounded number of concurrent storage operations. Total size and the "Couldn't fetch content file with hash" error are unchanged.
