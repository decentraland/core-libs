/**
 * Minimal image-metadata reader used by thumbnail validations.
 *
 * The library only needs to know the format ("png" vs anything else) and the
 * pixel dimensions to enforce the catalyst thumbnail rules. We deliberately
 * avoid pulling in `sharp` for that — a full image pipeline with native
 * bindings is overkill for a header read, and ships a multi-MB libvips that
 * needs an extra system dependency on every CI runner.
 *
 * Beyond reading dimensions, the reader applies structural sanity checks per
 * format: PNG chunk-chain integrity (single IHDR, terminating IEND, no
 * trailing data, spec-allowed bit-depth/color-type combination), JPEG
 * EOI termination, WebP RIFF chunk-size match, and a uniform "non-zero,
 * non-negative dimensions" contract on the returned width/height.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const PNG_IHDR_BYTES = Buffer.from('IHDR', 'ascii')
const PNG_IEND_BYTES = Buffer.from('IEND', 'ascii')
const PNG_IHDR_CHUNK_LENGTH = 13
const PNG_FIRST_CHUNK_END = 33
const PNG_CHUNK_OVERHEAD = 12
const PNG_MAX_CHUNK_LENGTH = 0x7fffffff
const PNG_VALID_BIT_DEPTHS_BY_COLOR_TYPE: Record<number, readonly number[]> = {
  0: [1, 2, 4, 8, 16], // Grayscale
  2: [8, 16], // Truecolor (RGB)
  3: [1, 2, 4, 8], // Indexed-colour (Palette)
  4: [8, 16], // Greyscale + Alpha
  6: [8, 16]
}

const WEBP_RIFF_BYTES = Buffer.from('RIFF', 'ascii')
const WEBP_WEBP_BYTES = Buffer.from('WEBP', 'ascii')
const WEBP_VP8_BYTES = Buffer.from('VP8 ', 'ascii')
const WEBP_VP8L_BYTES = Buffer.from('VP8L', 'ascii')
const WEBP_VP8X_BYTES = Buffer.from('VP8X', 'ascii')

const GIF87A_BYTES = Buffer.from('GIF87a', 'ascii')
const GIF89A_BYTES = Buffer.from('GIF89a', 'ascii')

const JPEG_EOI_BYTE_1 = 0xff
const JPEG_EOI_BYTE_2 = 0xd9

/**
 * Compare a slice of `buffer` to `expected` using byte-exact equality.
 *
 * Buffer.toString('ascii') masks the high bit of each byte before decoding,
 * so a chunk type stored as e.g. [0x49, 0x48, 0xC4, 0x52] would otherwise
 * decode as "IHDR" — a parser differential vs. real PNG/WebP/GIF readers.
 * This helper is used everywhere a magic byte sequence or chunk identifier
 * needs to be compared.
 */
function bufferEqualsAt(buffer: Buffer, offset: number, expected: Buffer): boolean {
  if (offset < 0 || offset + expected.length > buffer.length) return false
  return buffer.subarray(offset, offset + expected.length).equals(expected)
}

/**
 * Image formats recognised by {@link readImageMetadata}.
 *
 * The reader detects each format by its magic bytes and validates the
 * minimum structural invariants needed to extract dimensions safely.
 * @public
 */
export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'bmp'

/**
 * Header-derived dimensions and format of an image.
 *
 * Width and height are guaranteed to be positive integers — the reader
 * throws rather than returning zero, negative, or non-integer values.
 * @public
 */
export interface ImageMetadata {
  format: ImageFormat
  width: number
  height: number
}

const FORMAT_DISPLAY_NAME: Record<ImageFormat, string> = {
  png: 'PNG',
  jpeg: 'JPEG',
  webp: 'WebP',
  gif: 'GIF',
  bmp: 'BMP'
}

/**
 * Reads the format and pixel dimensions of a recognised image buffer.
 *
 * Recognises PNG, JPEG, WebP, GIF, and BMP by their magic bytes. The library
 * only enforces a PNG-format check on top of this, but recognising the other
 * common formats means a user uploading a JPEG/WebP/GIF/BMP thumbnail gets
 * the precise "Invalid format" error instead of a generic parse failure.
 *
 * Throws if the buffer is not a recognised, structurally-valid image with
 * non-zero, non-negative dimensions. Callers are expected to wrap calls in
 * try/catch to translate the throw into a "couldn't parse" validation error.
 * @public
 */
export function readImageMetadata(input: Uint8Array): ImageMetadata {
  if (typeof SharedArrayBuffer !== 'undefined' && input.buffer instanceof SharedArrayBuffer) {
    throw new Error('Image input must not be backed by a SharedArrayBuffer')
  }
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  let metadata: ImageMetadata
  if (isPng(buffer)) metadata = readPngMetadata(buffer)
  else if (isJpeg(buffer)) metadata = readJpegMetadata(buffer)
  else if (isWebp(buffer)) metadata = readWebpMetadata(buffer)
  else if (isGif(buffer)) metadata = readGifMetadata(buffer)
  else if (isBmp(buffer)) metadata = readBmpMetadata(buffer)
  else throw new Error('Unsupported image format')
  assertPositiveDimensions(metadata)
  return metadata
}

function assertPositiveDimensions(metadata: ImageMetadata): void {
  const name = FORMAT_DISPLAY_NAME[metadata.format]
  if (!Number.isInteger(metadata.width) || metadata.width <= 0) {
    throw new Error(`Malformed ${name}: non-positive width ${metadata.width}`)
  }
  if (!Number.isInteger(metadata.height) || metadata.height <= 0) {
    throw new Error(`Malformed ${name}: non-positive height ${metadata.height}`)
  }
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= PNG_FIRST_CHUNK_END && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
}

function readPngMetadata(buffer: Buffer): ImageMetadata {
  if (buffer.readUInt32BE(8) !== PNG_IHDR_CHUNK_LENGTH) {
    throw new Error('Malformed PNG: IHDR chunk length is not 13')
  }
  if (!bufferEqualsAt(buffer, 12, PNG_IHDR_BYTES)) {
    throw new Error('Malformed PNG: missing IHDR chunk')
  }
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  validatePngBitDepthAndColorType(buffer.readUInt8(24), buffer.readUInt8(25))
  validatePngIhdrMethods(buffer.readUInt8(26), buffer.readUInt8(27), buffer.readUInt8(28))
  validatePngChunkChain(buffer)
  return { format: 'png', width, height }
}

function validatePngBitDepthAndColorType(bitDepth: number, colorType: number): void {
  const allowed = PNG_VALID_BIT_DEPTHS_BY_COLOR_TYPE[colorType]
  if (!allowed) {
    throw new Error(`Malformed PNG: invalid color type ${colorType}`)
  }
  if (!allowed.includes(bitDepth)) {
    throw new Error(`Malformed PNG: invalid bit depth ${bitDepth} for color type ${colorType}`)
  }
}

function validatePngIhdrMethods(compression: number, filter: number, interlace: number): void {
  if (compression !== 0) {
    throw new Error(`Malformed PNG: invalid compression method ${compression}`)
  }
  if (filter !== 0) {
    throw new Error(`Malformed PNG: invalid filter method ${filter}`)
  }
  if (interlace !== 0 && interlace !== 1) {
    throw new Error(`Malformed PNG: invalid interlace method ${interlace}`)
  }
}

function validatePngChunkChain(buffer: Buffer): void {
  let i = PNG_FIRST_CHUNK_END
  while (i + PNG_CHUNK_OVERHEAD <= buffer.length) {
    const chunkDataLength = buffer.readUInt32BE(i)
    if (chunkDataLength > PNG_MAX_CHUNK_LENGTH) {
      throw new Error('Malformed PNG: chunk length exceeds 2^31-1')
    }
    if (bufferEqualsAt(buffer, i + 4, PNG_IHDR_BYTES)) {
      throw new Error('Malformed PNG: duplicate IHDR chunk')
    }
    if (bufferEqualsAt(buffer, i + 4, PNG_IEND_BYTES)) {
      if (chunkDataLength !== 0) {
        throw new Error('Malformed PNG: IEND chunk must have zero length')
      }
      if (i + PNG_CHUNK_OVERHEAD !== buffer.length) {
        throw new Error('Malformed PNG: data after IEND chunk')
      }
      return
    }
    i += PNG_CHUNK_OVERHEAD + chunkDataLength
  }
  throw new Error('Malformed PNG: missing IEND chunk')
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function readJpegMetadata(buffer: Buffer): ImageMetadata {
  if (
    buffer.length < 4 ||
    buffer[buffer.length - 2] !== JPEG_EOI_BYTE_1 ||
    buffer[buffer.length - 1] !== JPEG_EOI_BYTE_2
  ) {
    throw new Error('Malformed JPEG: missing EOI marker')
  }
  let i = 2
  while (i < buffer.length - 8) {
    if (buffer[i] !== 0xff) {
      i++
      continue
    }
    const marker = buffer[i + 1]
    if (marker === 0x00 || marker === 0xff) {
      i++
      continue
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      i += 2
      continue
    }
    if (marker === 0xda) {
      break
    }
    const isStartOfFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isStartOfFrame) {
      return {
        format: 'jpeg',
        height: buffer.readUInt16BE(i + 5),
        width: buffer.readUInt16BE(i + 7)
      }
    }
    const segmentLength = buffer.readUInt16BE(i + 2)
    if (segmentLength < 2) break
    i += 2 + segmentLength
  }
  throw new Error('Malformed JPEG: no SOFn marker found')
}

function isWebp(buffer: Buffer): boolean {
  return buffer.length >= 16 && bufferEqualsAt(buffer, 0, WEBP_RIFF_BYTES) && bufferEqualsAt(buffer, 8, WEBP_WEBP_BYTES)
}

function readWebpMetadata(buffer: Buffer): ImageMetadata {
  const declaredRiffSize = buffer.readUInt32LE(4)
  if (declaredRiffSize !== buffer.length - 8) {
    throw new Error('Malformed WebP: RIFF chunk size does not match buffer length')
  }
  if (bufferEqualsAt(buffer, 12, WEBP_VP8_BYTES)) {
    if (buffer.length < 30) {
      throw new Error('Malformed WebP: VP8 chunk truncated')
    }
    assertWebpSimpleSubChunkSize(buffer, 'VP8')
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      throw new Error('Malformed WebP: invalid VP8 keyframe sync code')
    }
    return {
      format: 'webp',
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    }
  }
  if (bufferEqualsAt(buffer, 12, WEBP_VP8L_BYTES)) {
    if (buffer.length < 25) {
      throw new Error('Malformed WebP: VP8L chunk truncated')
    }
    assertWebpSimpleSubChunkSize(buffer, 'VP8L')
    if (buffer[20] !== 0x2f) {
      throw new Error('Malformed WebP: invalid VP8L signature byte')
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
  if (bufferEqualsAt(buffer, 12, WEBP_VP8X_BYTES)) {
    if (buffer.length < 30) {
      throw new Error('Malformed WebP: VP8X chunk truncated')
    }
    if (buffer.readUInt32LE(16) !== 10) {
      throw new Error('Malformed WebP: VP8X chunk size must be 10')
    }
    return {
      format: 'webp',
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    }
  }
  throw new Error(`Malformed WebP: unknown variant '${sanitiseForLog(buffer.toString('latin1', 12, 16))}'`)
}

/**
 * For Simple File Format WebP (VP8 / VP8L), the inner chunk's declared payload
 * size at offset 16 must — together with the 8-byte chunk header and an
 * optional 1-byte RIFF pad for odd-length payloads — account for everything
 * after the 12-byte RIFF/WEBP preamble. Catches parser-differential attacks
 * where a tampered chunk size is silently accepted by readers that work off
 * fixed offsets.
 */
function assertWebpSimpleSubChunkSize(buffer: Buffer, label: 'VP8' | 'VP8L'): void {
  const declared = buffer.readUInt32LE(16)
  const expectedPayload = buffer.length - 20
  const expectedPayloadWithoutPad = buffer.length - 21
  if (declared !== expectedPayload && declared !== expectedPayloadWithoutPad) {
    throw new Error(`Malformed WebP: ${label} chunk size does not match buffer length`)
  }
}

/**
 * Replace control characters and non-printable bytes in a user-controlled
 * string before interpolating it into an error message. PNG/JPEG/WebP type
 * fields are 7-bit ASCII per spec, but a malicious buffer can put any
 * 0x00-0x7F byte there — including newline / carriage return / NUL — which
 * could otherwise smuggle log lines through downstream consumers.
 */
function sanitiseForLog(value: string): string {
  return value.replace(/[^\x20-\x7e]/g, '?')
}

function isGif(buffer: Buffer): boolean {
  return buffer.length >= 14 && (bufferEqualsAt(buffer, 0, GIF87A_BYTES) || bufferEqualsAt(buffer, 0, GIF89A_BYTES))
}

function readGifMetadata(buffer: Buffer): ImageMetadata {
  if (buffer[buffer.length - 1] !== 0x3b) {
    throw new Error('Malformed GIF: missing trailer byte')
  }
  return {
    format: 'gif',
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8)
  }
}

const BMP_BITMAPCOREHEADER_SIZE = 12

function isBmp(buffer: Buffer): boolean {
  return buffer.length >= 22 && buffer[0] === 0x42 && buffer[1] === 0x4d
}

function readBmpMetadata(buffer: Buffer): ImageMetadata {
  const declaredFileSize = buffer.readUInt32LE(2)
  if (declaredFileSize !== buffer.length) {
    throw new Error('Malformed BMP: file size header does not match buffer length')
  }
  const dibHeaderSize = buffer.readUInt32LE(14)
  if (dibHeaderSize === BMP_BITMAPCOREHEADER_SIZE) {
    return {
      format: 'bmp',
      width: buffer.readUInt16LE(18),
      height: buffer.readUInt16LE(20)
    }
  }
  if (buffer.length < 26) {
    throw new Error('Malformed BMP: BITMAPINFOHEADER truncated')
  }
  return {
    format: 'bmp',
    width: buffer.readInt32LE(18),
    height: Math.abs(buffer.readInt32LE(22))
  }
}
