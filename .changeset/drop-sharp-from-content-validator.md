---
"@dcl/content-validator": minor
---

Drop the `sharp` dependency. The library only needs the format and pixel
dimensions of thumbnails, which is now handled by a small in-house PNG/JPEG
header reader. Removes the libvips system requirement (and its CI install
step), the multi-MB native binary, and the cross-platform PNG-encoding
flakiness it caused.
