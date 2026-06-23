---
"@dcl/content-validator": patch
---

performance: the profile-images validation no longer re-scans every uploaded file's hash once per avatar (it was O(avatars × files)). The per-avatar requirement (each avatar must declare face/body thumbnail hashes) still runs in the avatar loop; the file-hash comparison now runs once. The pass/fail outcome is unchanged — a mismatched file is now reported a single time instead of once per avatar.
