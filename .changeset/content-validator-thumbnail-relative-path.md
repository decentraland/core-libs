---
"@dcl/content-validator": patch
---

Require a scene's `display.navmapThumbnail` to be a relative path to an embedded content file. `embeddedThumbnail` now rejects, before the existing embedded-file check, any value that is not a plain relative path: values carrying a URI scheme (`https:`, `data:`, `javascript:`, …), protocol-relative (`//host/…`) or root-absolute (`/x`) paths, values with leading/trailing whitespace or control characters, and values containing the HTML-breakout characters `<`, `>` or `"`.

Previously the validation only required an exact match against a declared `content[].file`, so an absolute URL carrying breakout characters was accepted as long as the same string was also declared as a content mapping. Downstream consumers that keep `https://`-prefixed thumbnails verbatim (e.g. the Places social/OpenGraph endpoint) then interpolated the value into HTML, turning the filename into stored XSS. Constraining the field at the deployment gate stops the payload from ever being accepted.

This is backward-compatible: a legitimate absolute-URL thumbnail already failed the embedded-file check, so only the attack construction changes outcome.
