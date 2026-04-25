import { readImageMetadata } from '../../src/image-metadata'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const buildPng = (
  width: number,
  height: number,
  options: { ihdrOverride?: string; ihdrLength?: number } = {}
): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(options.ihdrLength ?? 13, 0)
  const type = Buffer.from(options.ihdrOverride ?? 'IHDR', 'ascii')
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width, 0)
  data.writeUInt32BE(height, 4)
  data.writeUInt8(8, 8)
  data.writeUInt8(6, 9)
  return Buffer.concat([PNG_SIGNATURE, length, type, data, Buffer.alloc(4)])
}

const buildJpeg = (width: number, height: number, marker = 0xc0): Buffer => {
  const sof = Buffer.alloc(19)
  sof.writeUInt8(0xff, 0)
  sof.writeUInt8(marker, 1)
  sof.writeUInt16BE(17, 2)
  sof.writeUInt8(8, 4)
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  sof.writeUInt8(3, 9)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])])
}

const buildWebpVp8 = (width: number, height: number): Buffer => {
  // RIFF[size]WEBPVP8 [chunk-size:4][frame-tag:3][sync:3][width:2 LE][height:2 LE]
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8 ', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  // bytes 20-22: frame-tag (left as zeros)
  // bytes 23-25: VP8 keyframe sync code (mandatory per spec)
  buffer.writeUInt8(0x9d, 23)
  buffer.writeUInt8(0x01, 24)
  buffer.writeUInt8(0x2a, 25)
  buffer.writeUInt16LE(width, 26)
  buffer.writeUInt16LE(height, 28)
  return buffer
}

const buildWebpVp8l = (width: number, height: number): Buffer => {
  // RIFF[size]WEBPVP8L[chunk-size:4][signature:1][packed dimensions:4]
  const buffer = Buffer.alloc(25)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(17, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8L', 12, 'ascii')
  buffer.writeUInt32LE(5, 16)
  buffer.writeUInt8(0x2f, 20)
  // Pack (width-1) into bits 0-13 and (height-1) into bits 14-27.
  const packed = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14)
  buffer.writeUInt32LE(packed >>> 0, 21)
  return buffer
}

const buildWebpVp8x = (width: number, height: number): Buffer => {
  // RIFF[size]WEBPVP8X[chunk-size:4][flags:1][reserved:3][width-1:3 LE][height-1:3 LE]
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write('VP8X', 12, 'ascii')
  buffer.writeUInt32LE(10, 16)
  // bytes 20..23 are flags + reserved (zeros are fine for the reader)
  buffer.writeUIntLE(width - 1, 24, 3)
  buffer.writeUIntLE(height - 1, 27, 3)
  return buffer
}

const buildWebpUnknownVariant = (variant: string): Buffer => {
  const buffer = Buffer.alloc(30)
  buffer.write('RIFF', 0, 'ascii')
  buffer.writeUInt32LE(22, 4)
  buffer.write('WEBP', 8, 'ascii')
  buffer.write(variant, 12, 'ascii')
  return buffer
}

const buildGif = (width: number, height: number): Buffer => {
  const buffer = Buffer.alloc(13)
  buffer.write('GIF89a', 0, 'ascii')
  buffer.writeUInt16LE(width, 6)
  buffer.writeUInt16LE(height, 8)
  return buffer
}

const buildBmp = (width: number, height: number): Buffer => {
  // BITMAPFILEHEADER (14 bytes) + BITMAPINFOHEADER (40 bytes).
  const buffer = Buffer.alloc(54)
  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(40, 14) // DIB header size = BITMAPINFOHEADER
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  return buffer
}

const buildBmpCoreHeader = (width: number, height: number): Buffer => {
  // BITMAPFILEHEADER (14 bytes) + BITMAPCOREHEADER (12 bytes).
  const buffer = Buffer.alloc(26)
  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(12, 14)
  buffer.writeUInt16LE(width, 18)
  buffer.writeUInt16LE(height, 20)
  return buffer
}

describe('when reading image metadata', () => {
  describe('and the buffer is a PNG with valid header', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildPng(1024, 768))
    })

    it('should report format png with the IHDR width and height', () => {
      expect(metadata).toEqual({ format: 'png', width: 1024, height: 768 })
    })
  })

  describe('and the buffer is a PNG passed as a plain Uint8Array view', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      const png = buildPng(256, 256)
      metadata = readImageMetadata(new Uint8Array(png.buffer, png.byteOffset, png.byteLength))
    })

    it('should still report the IHDR width and height', () => {
      expect(metadata).toEqual({ format: 'png', width: 256, height: 256 })
    })
  })

  describe('and the PNG IHDR chunk reports a length other than 13', () => {
    it('should throw with a malformed-PNG length error', () => {
      expect(() => readImageMetadata(buildPng(10, 10, { ihdrLength: 99 }))).toThrow(
        'Malformed PNG: IHDR chunk length is not 13'
      )
    })
  })

  describe('and the buffer has the PNG signature but no IHDR chunk', () => {
    it('should throw with a malformed-PNG message', () => {
      expect(() => readImageMetadata(buildPng(10, 10, { ihdrOverride: 'IDAT' }))).toThrow(
        'Malformed PNG: missing IHDR chunk'
      )
    })
  })

  describe('and the buffer is a JPEG with a SOF0 marker', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildJpeg(640, 480))
    })

    it('should report format jpeg with the SOF0 width and height', () => {
      expect(metadata).toEqual({ format: 'jpeg', width: 640, height: 480 })
    })
  })

  describe('and the JPEG SOF marker is one of the alternate frame types', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildJpeg(800, 600, 0xc2))
    })

    it('should still extract the width and height', () => {
      expect(metadata).toEqual({ format: 'jpeg', width: 800, height: 600 })
    })
  })

  describe('and the JPEG buffer has no SOFn marker', () => {
    it('should throw with a malformed-JPEG message', () => {
      const onlyHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
      expect(() => readImageMetadata(onlyHeader)).toThrow('Malformed JPEG: no SOFn marker found')
    })
  })

  describe('and the buffer is a WebP (lossy VP8) image', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildWebpVp8(320, 240))
    })

    it('should report format webp with the VP8 width and height', () => {
      expect(metadata).toEqual({ format: 'webp', width: 320, height: 240 })
    })
  })

  describe('and the buffer is a WebP (lossless VP8L) image with values larger than 8 bits', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildWebpVp8l(300, 400))
    })

    it('should unpack the VP8L width-1 and height-1 fields correctly', () => {
      expect(metadata).toEqual({ format: 'webp', width: 300, height: 400 })
    })
  })

  describe('and the buffer is a WebP (extended VP8X) image', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildWebpVp8x(1920, 1080))
    })

    it('should unpack the VP8X canvas width-1 and height-1 fields', () => {
      expect(metadata).toEqual({ format: 'webp', width: 1920, height: 1080 })
    })
  })

  describe('and the WebP variant identifier is unknown', () => {
    it('should throw with an unknown-variant message', () => {
      expect(() => readImageMetadata(buildWebpUnknownVariant('VP9 '))).toThrow("Malformed WebP: unknown variant 'VP9 '")
    })
  })

  describe('and the WebP VP8L chunk is truncated below the minimum length', () => {
    it('should throw with a truncated-chunk message', () => {
      const truncated = Buffer.alloc(24)
      buildWebpVp8l(64, 48).copy(truncated, 0, 0, 24)
      expect(() => readImageMetadata(truncated)).toThrow('Malformed WebP: VP8L chunk truncated')
    })
  })

  describe('and the WebP VP8 chunk is truncated below the minimum length', () => {
    it('should throw with a truncated-chunk message', () => {
      const truncated = Buffer.alloc(29)
      buildWebpVp8(320, 240).copy(truncated, 0, 0, 29)
      expect(() => readImageMetadata(truncated)).toThrow('Malformed WebP: VP8 chunk truncated')
    })
  })

  describe('and the WebP VP8 chunk has an invalid sync code', () => {
    it('should throw with an invalid-sync-code message', () => {
      const tampered = buildWebpVp8(320, 240)
      tampered.writeUInt8(0x00, 23)
      expect(() => readImageMetadata(tampered)).toThrow('Malformed WebP: invalid VP8 keyframe sync code')
    })
  })

  describe.each([
    ['width and height that fit in 8 bits', 200, 150],
    ['width and height that span byte boundaries (>= 4096)', 5000, 8000],
    ['the maximum representable VP8L dimensions', 16384, 16384],
    ['arbitrary mid-range values', 12345, 9876]
  ])('and the buffer is a WebP (lossless VP8L) image with %s', (_label, width, height) => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildWebpVp8l(width, height))
    })

    it('should round-trip the encoded width and height', () => {
      expect(metadata).toEqual({ format: 'webp', width, height })
    })
  })

  describe('and the buffer is a GIF89a image', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildGif(64, 48))
    })

    it('should report format gif with the logical-screen width and height', () => {
      expect(metadata).toEqual({ format: 'gif', width: 64, height: 48 })
    })
  })

  describe('and the buffer is a BMP image with positive height', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildBmp(128, 96))
    })

    it('should report format bmp with the BITMAPINFOHEADER width and height', () => {
      expect(metadata).toEqual({ format: 'bmp', width: 128, height: 96 })
    })
  })

  describe('and the buffer is a BMP image with negative height (top-down DIB)', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildBmp(128, -96))
    })

    it('should report the absolute pixel height', () => {
      expect(metadata).toEqual({ format: 'bmp', width: 128, height: 96 })
    })
  })

  describe('and the buffer is a BMP image with the legacy BITMAPCOREHEADER (DIB size 12)', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      metadata = readImageMetadata(buildBmpCoreHeader(64, 48))
    })

    it('should read the 16-bit width and height fields', () => {
      expect(metadata).toEqual({ format: 'bmp', width: 64, height: 48 })
    })
  })

  describe('and the BMP buffer is a BITMAPINFOHEADER variant truncated below 26 bytes', () => {
    it('should throw with a truncated-header message', () => {
      // Looks like a BIH (DIB size 40) but the buffer is only 25 bytes.
      const truncated = Buffer.alloc(25)
      truncated.write('BM', 0, 'ascii')
      truncated.writeUInt32LE(40, 14)
      expect(() => readImageMetadata(truncated)).toThrow('Malformed BMP: BITMAPINFOHEADER truncated')
    })
  })

  describe('and the JPEG has a standalone restart marker before the SOFn', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      // SOI + RST0 (standalone, no length field) + SOFn(640x480) + EOI.
      // If the parser tried to interpret the two bytes after RST0 as a
      // segment length, it would skip into the SOFn segment and fail.
      const sof = Buffer.alloc(19)
      sof.writeUInt8(0xff, 0)
      sof.writeUInt8(0xc0, 1)
      sof.writeUInt16BE(17, 2)
      sof.writeUInt8(8, 4)
      sof.writeUInt16BE(480, 5)
      sof.writeUInt16BE(640, 7)
      sof.writeUInt8(3, 9)
      const buffer = Buffer.concat([
        Buffer.from([0xff, 0xd8]),
        Buffer.from([0xff, 0xd0]),
        sof,
        Buffer.from([0xff, 0xd9])
      ])
      metadata = readImageMetadata(buffer)
    })

    it('should still find the SOFn dimensions', () => {
      expect(metadata).toEqual({ format: 'jpeg', width: 640, height: 480 })
    })
  })

  describe('and the input is a Uint8Array view with a non-zero byteOffset', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      const png = buildPng(512, 512)
      const padded = Buffer.alloc(8 + png.length)
      png.copy(padded, 8)
      const view = new Uint8Array(padded.buffer, padded.byteOffset + 8, png.length)
      metadata = readImageMetadata(view)
    })

    it('should still report the IHDR width and height from the offset view', () => {
      expect(metadata).toEqual({ format: 'png', width: 512, height: 512 })
    })
  })

  describe('and the buffer has a PNG signature but is truncated below the IHDR data', () => {
    it('should throw an unsupported-format error from the length guard', () => {
      const truncated = Buffer.alloc(20)
      buildPng(64, 64).copy(truncated, 0, 0, 20)
      expect(() => readImageMetadata(truncated)).toThrow('Unsupported image format')
    })
  })

  describe('and the buffer is too short or unrecognised', () => {
    it('should throw an unsupported-format error', () => {
      expect(() => readImageMetadata(Buffer.alloc(1))).toThrow('Unsupported image format')
      expect(() => readImageMetadata(Buffer.from([0x49, 0x49, 0x2a, 0x00]))).toThrow('Unsupported image format')
    })
  })
})
