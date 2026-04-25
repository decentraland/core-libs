/**
 * Minimal image-metadata reader used by thumbnail validations.
 *
 * The library only needs to know the format ("png" vs anything else) and the
 * pixel dimensions to enforce the catalyst thumbnail rules. We deliberately
 * avoid pulling in `sharp` for that — a full image pipeline with native
 * bindings is overkill for a header read, and ships a multi-MB libvips that
 * needs an extra system dependency on every CI runner.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IHDR_CHUNK_LENGTH = 13

const WEBP_VARIANT_VP8 = 'VP8 '
const WEBP_VARIANT_VP8L = 'VP8L'
const WEBP_VARIANT_VP8X = 'VP8X'

/**
 * @public
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp'

/**
 * @public
 */
export interface ImageMetadata {
  format: ImageFormat
  width: number
  height: number
}

/**
 * Reads the format and pixel dimensions of a recognised image buffer.
 *
 * Recognises PNG, JPEG, WebP, GIF, and BMP by their magic bytes. The library
 * only enforces a PNG-format check on top of this, but recognising the other
 * common formats means a user uploading a JPEG/WebP/GIF/BMP thumbnail gets
 * the precise "Invalid format" error instead of a generic parse failure.
 *
 * Throws if the buffer is not one of the recognised formats. Callers are
 * expected to wrap calls in try/catch to translate the throw into a
 * "couldn't parse" validation error.
 * @public
 */
export function readImageMetadata(input: Uint8Array): ImageMetadata {
  // Wrap as Buffer to access readUInt*BE / equals / toString without copying.
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (isPng(buffer)) return readPngMetadata(buffer)
  if (isJpeg(buffer)) return readJpegMetadata(buffer)
  if (isWebp(buffer)) return readWebpMetadata(buffer)
  if (isGif(buffer)) return readGifMetadata(buffer)
  if (isBmp(buffer)) return readBmpMetadata(buffer)
  throw new Error('Unsupported image format')
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
}

function readPngMetadata(buffer: Buffer): ImageMetadata {
  if (buffer.readUInt32BE(8) !== PNG_IHDR_CHUNK_LENGTH) {
    throw new Error('Malformed PNG: IHDR chunk length is not 13')
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error('Malformed PNG: missing IHDR chunk')
  }
  return {
    format: 'png',
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  }
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function readJpegMetadata(buffer: Buffer): ImageMetadata {
  // JPEG is a chain of 0xFF-prefixed segments. Dimensions live in any of the
  // SOFn (Start Of Frame) segments — markers 0xC0..0xCF except 0xC4 (DHT),
  // 0xC8 (JPG, reserved), and 0xCC (DAC). The SOFn payload reads up to
  // buffer[i + 8], so we need `i + 8 < buffer.length`.
  let i = 2
  while (i < buffer.length - 8) {
    if (buffer[i] !== 0xff) {
      i++
      continue
    }
    const marker = buffer[i + 1]
    // Skip fill bytes (0xFF padding before a real marker).
    if (marker === 0x00 || marker === 0xff) {
      i++
      continue
    }
    // Standalone markers have no length field. Advance past the marker only
    // so we don't read the next two bytes as a bogus segment length and
    // desynchronise the parser. TEM=0x01, RST0..7=0xD0..0xD7, SOI=0xD8,
    // EOI=0xD9.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      // SOFn payload: [length:2][precision:1][height:2][width:2][...]
      return {
        format: 'jpeg',
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7)
      }
    }
    if (i + 4 > buffer.length) break
    const segmentLength = buffer.readUInt16BE(i + 2)
    if (segmentLength < 2) break
    i += 2 + segmentLength
  }
  throw new Error('Malformed JPEG: no SOFn marker found')
}

function isWebp(buffer: Buffer): boolean {
  // RIFF[4 bytes file size]WEBP[4 bytes variant identifier]
  return buffer.length >= 16 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
}

function readWebpMetadata(buffer: Buffer): ImageMetadata {
  // After "WEBP" comes a sub-chunk identifier ("VP8 ", "VP8L", or "VP8X")
  // and dimensions are encoded slightly differently per variant.
  const variant = buffer.toString('ascii', 12, 16)
  if (variant === WEBP_VARIANT_VP8) {
    // Lossy: width/height are at bytes 26-29 as 14-bit little-endian values,
    // preceded by the mandatory 3-byte VP8 keyframe sync code at bytes 23-25.
    if (buffer.length < 30) {
      throw new Error('Malformed WebP: VP8 chunk truncated')
    }
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      throw new Error('Malformed WebP: invalid VP8 keyframe sync code')
    }
    return {
      format: 'webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    }
  }
  if (variant === WEBP_VARIANT_VP8L) {
    // Lossless: width-1 and height-1 are packed into bytes 21-24.
    if (buffer.length < 25) {
      throw new Error('Malformed WebP: VP8L chunk truncated')
    }
    const b0 = buffer[21]
    const b1 = buffer[22]
    const b2 = buffer[23]
    const b3 = buffer[24]
    return {
      format: 'webp',
      width: 1 + ((b0 | (b1 << 8)) & 0x3fff),
      height: 1 + (((b1 >> 6) | (b2 << 2) | (b3 << 10)) & 0x3fff)
    }
  }
  if (variant === WEBP_VARIANT_VP8X) {
    // Extended: width-1 and height-1 as 24-bit little-endian at bytes 24-29.
    if (buffer.length < 30) {
      throw new Error('Malformed WebP: VP8X chunk truncated')
    }
    return {
      format: 'webp',
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    }
  }
  throw new Error(`Malformed WebP: unknown variant '${variant}'`)
}

function isGif(buffer: Buffer): boolean {
  if (buffer.length < 10) return false
  const header = buffer.toString('ascii', 0, 6)
  return header === 'GIF87a' || header === 'GIF89a'
}

function readGifMetadata(buffer: Buffer): ImageMetadata {
  // Logical screen descriptor: width at bytes 6-7, height at 8-9, little-endian.
  return {
    format: 'gif',
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8)
  }
}

const BMP_BITMAPCOREHEADER_SIZE = 12

function isBmp(buffer: Buffer): boolean {
  // 14-byte BITMAPFILEHEADER + at least the 4-byte DIB header size field, plus
  // enough room to read the smallest DIB header's width/height (BITMAPCOREHEADER
  // ends at byte 21; everything else extends to 25).
  return buffer.length >= 22 && buffer[0] === 0x42 && buffer[1] === 0x4d
}

function readBmpMetadata(buffer: Buffer): ImageMetadata {
  const dibHeaderSize = buffer.readUInt32LE(14)
  if (dibHeaderSize === BMP_BITMAPCOREHEADER_SIZE) {
    // BITMAPCOREHEADER (OS/2 v1): 16-bit width and height at offsets 18-19 and
    // 20-21. Negative heights are not defined for this header.
    return {
      format: 'bmp',
      width: buffer.readUInt16LE(18),
      height: buffer.readUInt16LE(20)
    }
  }
  // BITMAPINFOHEADER and its extended variants (40, 52, 56, 108, 124 bytes).
  // Width is signed int32 LE at 18-21, height is signed int32 LE at 22-25.
  // A negative height encodes a top-down DIB; absolute value is the pixel
  // height.
  if (buffer.length < 26) {
    throw new Error('Malformed BMP: BITMAPINFOHEADER truncated')
  }
  return {
    format: 'bmp',
    width: buffer.readInt32LE(18),
    height: Math.abs(buffer.readInt32LE(22))
  }
}
