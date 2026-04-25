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

/**
 * @public
 */
export type ImageFormat = 'png' | 'jpeg'

/**
 * @public
 */
export interface ImageMetadata {
  format: ImageFormat
  width: number
  height: number
}

/**
 * Reads the format and pixel dimensions of a PNG or JPEG buffer.
 *
 * Throws if the buffer is not a recognised PNG or JPEG image. Callers are
 * expected to wrap calls in try/catch to translate the throw into a
 * "couldn't parse" validation error, matching the previous sharp behaviour.
 * @public
 */
export function readImageMetadata(input: Uint8Array): ImageMetadata {
  // Wrap as Buffer to access readUInt*BE / equals / toString without copying.
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input.buffer, input.byteOffset, input.byteLength)
  if (isPng(buffer)) {
    if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
      throw new Error('Malformed PNG: missing IHDR chunk')
    }
    return {
      format: 'png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20)
    }
  }
  if (isJpeg(buffer)) {
    return readJpegMetadata(buffer)
  }
  throw new Error('Unsupported image format')
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 24 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function readJpegMetadata(buffer: Buffer): ImageMetadata {
  // JPEG is a chain of 0xFF-prefixed segments. Dimensions live in any of the
  // SOFn (Start Of Frame) segments — markers 0xC0..0xCF except 0xC4 (DHT),
  // 0xC8 (JPG, reserved), and 0xCC (DAC).
  let i = 2
  while (i < buffer.length - 9) {
    if (buffer[i] !== 0xff) {
      i++
      continue
    }
    const marker = buffer[i + 1]
    // Skip fill bytes / standalone markers.
    if (marker === 0x00 || marker === 0xff) {
      i++
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
