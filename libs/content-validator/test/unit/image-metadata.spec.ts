import { readImageMetadata } from '../../src/image-metadata'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

interface BuildPngOptions {
  ihdrOverride?: string
  ihdrLength?: number
  bitDepth?: number
  colorType?: number
  compressionMethod?: number
  filterMethod?: number
  interlaceMethod?: number
  omitIend?: boolean
  duplicateIhdr?: boolean
  trailingBytes?: Buffer
  extraChunks?: Buffer
}

const buildPng = (width: number, height: number, options: BuildPngOptions = {}): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(options.ihdrLength ?? 13, 0)
  const type = Buffer.from(options.ihdrOverride ?? 'IHDR', 'ascii')
  const data = Buffer.alloc(13)
  data.writeUInt32BE(width, 0)
  data.writeUInt32BE(height, 4)
  data.writeUInt8(options.bitDepth ?? 8, 8)
  data.writeUInt8(options.colorType ?? 6, 9)
  data.writeUInt8(options.compressionMethod ?? 0, 10)
  data.writeUInt8(options.filterMethod ?? 0, 11)
  data.writeUInt8(options.interlaceMethod ?? 0, 12)
  const ihdr = Buffer.concat([length, type, data, Buffer.alloc(4)])
  const duplicateIhdr = options.duplicateIhdr ? buildPngChunk('IHDR', data) : Buffer.alloc(0)
  const extra = options.extraChunks ?? Buffer.alloc(0)
  const iend = options.omitIend ? Buffer.alloc(0) : buildPngChunk('IEND', Buffer.alloc(0))
  const trailing = options.trailingBytes ?? Buffer.alloc(0)
  return Buffer.concat([PNG_SIGNATURE, ihdr, duplicateIhdr, extra, iend, trailing])
}

const buildPngChunk = (type: string, data: Buffer): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  // CRC isn't validated by the reader, so zeros are fine for the test fixture.
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)])
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
  // 6-byte signature + 7-byte logical screen descriptor + 1-byte trailer.
  const buffer = Buffer.alloc(14)
  buffer.write('GIF89a', 0, 'ascii')
  buffer.writeUInt16LE(width, 6)
  buffer.writeUInt16LE(height, 8)
  buffer.writeUInt8(0x3b, 13)
  return buffer
}

const buildBmp = (width: number, height: number): Buffer => {
  // BITMAPFILEHEADER (14 bytes) + BITMAPINFOHEADER (40 bytes).
  const buffer = Buffer.alloc(54)
  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(buffer.length, 2) // file size header
  buffer.writeUInt32LE(40, 14) // DIB header size = BITMAPINFOHEADER
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
  return buffer
}

const buildBmpCoreHeader = (width: number, height: number): Buffer => {
  // BITMAPFILEHEADER (14 bytes) + BITMAPCOREHEADER (12 bytes).
  const buffer = Buffer.alloc(26)
  buffer.write('BM', 0, 'ascii')
  buffer.writeUInt32LE(buffer.length, 2)
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

  describe('and the PNG buffer is missing the terminating IEND chunk', () => {
    it('should throw with a missing-IEND message', () => {
      expect(() => readImageMetadata(buildPng(64, 64, { omitIend: true }))).toThrow('Malformed PNG: missing IEND chunk')
    })
  })

  describe('and the PNG buffer has trailing bytes after the IEND chunk', () => {
    it('should throw with a data-after-IEND message', () => {
      expect(() =>
        readImageMetadata(buildPng(64, 64, { trailingBytes: Buffer.from([0xde, 0xad, 0xbe, 0xef]) }))
      ).toThrow('Malformed PNG: data after IEND chunk')
    })
  })

  describe('and the PNG buffer contains a duplicate IHDR chunk', () => {
    it('should throw with a duplicate-IHDR message', () => {
      expect(() => readImageMetadata(buildPng(64, 64, { duplicateIhdr: true }))).toThrow(
        'Malformed PNG: duplicate IHDR chunk'
      )
    })
  })

  describe('and the PNG IHDR declares an invalid color type', () => {
    it('should throw with an invalid-color-type message', () => {
      expect(() => readImageMetadata(buildPng(64, 64, { colorType: 5 }))).toThrow('Malformed PNG: invalid color type 5')
    })
  })

  describe('and the PNG IHDR declares a bit depth that is not legal for its color type', () => {
    it('should throw with an invalid-bit-depth message', () => {
      // Color type 2 (RGB) only allows bit depths 8 and 16; 1 is illegal.
      expect(() => readImageMetadata(buildPng(64, 64, { colorType: 2, bitDepth: 1 }))).toThrow(
        'Malformed PNG: invalid bit depth 1 for color type 2'
      )
    })
  })

  describe('and the PNG buffer contains a chunk whose declared length overflows the buffer', () => {
    it('should reach the end of the chunk chain without finding IEND and throw', () => {
      // Insert a non-IEND chunk that claims a 2-billion-byte payload (just
      // under the 2^31-1 spec cap, so the length check passes and the chunk
      // walker advances past the buffer end).
      const oversize = Buffer.alloc(12)
      oversize.writeUInt32BE(0x7fffffff, 0)
      oversize.write('iTXt', 4, 'ascii')
      expect(() => readImageMetadata(buildPng(64, 64, { extraChunks: oversize }))).toThrow(
        'Malformed PNG: missing IEND chunk'
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
      // SOI + APP0 (length 16) + 12 bytes of zero payload + EOI.
      const onlyHeader = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9
      ])
      expect(() => readImageMetadata(onlyHeader)).toThrow('Malformed JPEG: no SOFn marker found')
    })
  })

  describe('and the JPEG buffer is missing the EOI marker', () => {
    it('should throw with a missing-EOI message', () => {
      const noEoi = Buffer.concat([buildJpeg(640, 480).subarray(0, -2), Buffer.from([0xaa, 0xbb])])
      expect(() => readImageMetadata(noEoi)).toThrow('Malformed JPEG: missing EOI marker')
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

  describe('and the WebP variant identifier contains control bytes', () => {
    it('should sanitise the variant in the error message to avoid log injection', () => {
      // \n in the variant string would otherwise inject a newline into log
      // pipelines that interpolate Error messages directly.
      expect(() => readImageMetadata(buildWebpUnknownVariant('A\nB\r'))).toThrow(
        "Malformed WebP: unknown variant 'A?B?'"
      )
    })
  })

  describe('and the WebP VP8 sub-chunk size does not match the payload length', () => {
    it('should throw with a sub-chunk size mismatch message', () => {
      const tampered = buildWebpVp8(320, 240)
      tampered.writeUInt32LE(0, 16) // declare a 0-byte VP8 chunk while file claims to hold one
      expect(() => readImageMetadata(tampered)).toThrow('Malformed WebP: VP8 chunk size does not match buffer length')
    })
  })

  describe('and the WebP VP8L sub-chunk size does not match the payload length', () => {
    it('should throw with a sub-chunk size mismatch message', () => {
      const tampered = buildWebpVp8l(64, 48)
      tampered.writeUInt32LE(99, 16)
      expect(() => readImageMetadata(tampered)).toThrow('Malformed WebP: VP8L chunk size does not match buffer length')
    })
  })

  describe('and the WebP VP8X sub-chunk size is not 10', () => {
    it('should throw because VP8X canvas info must be exactly 10 bytes', () => {
      const tampered = buildWebpVp8x(1920, 1080)
      tampered.writeUInt32LE(7, 16) // VP8X spec requires 10 here
      expect(() => readImageMetadata(tampered)).toThrow('Malformed WebP: VP8X chunk size must be 10')
    })
  })

  describe('and the input is backed by a SharedArrayBuffer', () => {
    it('should reject the input rather than expose a TOCTOU window', () => {
      const sab = new SharedArrayBuffer(64)
      const view = new Uint8Array(sab)
      view.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(() => readImageMetadata(view)).toThrow('Image input must not be backed by a SharedArrayBuffer')
    })
  })

  describe('and the buffer is exactly the PNG signature size (24 bytes)', () => {
    it('should reject as unsupported rather than throw a bounds-check RangeError', () => {
      // A 24-byte buffer with the PNG signature does not contain enough room
      // to read the bit-depth / color-type fields at offsets 24 and 25. The
      // reader must reject before attempting those reads.
      const truncated = Buffer.alloc(24)
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(truncated, 0)
      expect(() => readImageMetadata(truncated)).toThrow('Unsupported image format')
    })
  })

  describe('and the buffer is a PNG signature plus a partial IHDR (length 30)', () => {
    it('should reject as unsupported because the full IHDR is not yet present', () => {
      const truncated = Buffer.alloc(30)
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(truncated, 0)
      expect(() => readImageMetadata(truncated)).toThrow('Unsupported image format')
    })
  })

  describe('and the GIF buffer is missing the 0x3B trailer byte', () => {
    it('should throw with a missing-trailer message', () => {
      const noTrailer = buildGif(64, 48)
      noTrailer.writeUInt8(0x00, noTrailer.length - 1)
      expect(() => readImageMetadata(noTrailer)).toThrow('Malformed GIF: missing trailer byte')
    })
  })

  describe('and the WebP VP8L chunk is truncated below the minimum length', () => {
    it('should throw with a truncated-chunk message', () => {
      const truncated = Buffer.alloc(24)
      buildWebpVp8l(64, 48).copy(truncated, 0, 0, 24)
      // Re-write the RIFF size so the new RIFF-chunk-size check passes and
      // the per-variant truncation check is the one that fires.
      truncated.writeUInt32LE(truncated.length - 8, 4)
      expect(() => readImageMetadata(truncated)).toThrow('Malformed WebP: VP8L chunk truncated')
    })
  })

  describe('and the WebP VP8 chunk is truncated below the minimum length', () => {
    it('should throw with a truncated-chunk message', () => {
      const truncated = Buffer.alloc(29)
      buildWebpVp8(320, 240).copy(truncated, 0, 0, 29)
      truncated.writeUInt32LE(truncated.length - 8, 4)
      expect(() => readImageMetadata(truncated)).toThrow('Malformed WebP: VP8 chunk truncated')
    })
  })

  describe('and the WebP RIFF chunk size does not match the buffer length', () => {
    it('should throw with a RIFF size mismatch message', () => {
      const tampered = buildWebpVp8(320, 240)
      tampered.writeUInt32LE(999, 4) // wrong declared size
      expect(() => readImageMetadata(tampered)).toThrow('Malformed WebP: RIFF chunk size does not match buffer length')
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
      truncated.writeUInt32LE(truncated.length, 2)
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

  describe('and the buffer is a RIFF container that is not WebP', () => {
    it('should throw unsupported-format (RIFF/WAVE, not RIFF/WEBP)', () => {
      const wav = Buffer.alloc(36)
      wav.write('RIFF', 0, 'ascii')
      wav.writeUInt32LE(28, 4)
      wav.write('WAVE', 8, 'ascii')
      expect(() => readImageMetadata(wav)).toThrow('Unsupported image format')
    })
  })

  describe('and the buffer starts with "BM" but the DIB header reports an unknown size', () => {
    it('should treat it as a BIH variant and read the int32 fields', () => {
      const buffer = Buffer.alloc(54)
      buffer.write('BM', 0, 'ascii')
      buffer.writeUInt32LE(buffer.length, 2)
      buffer.writeUInt32LE(108, 14) // BITMAPV4HEADER size
      buffer.writeInt32LE(640, 18)
      buffer.writeInt32LE(480, 22)
      expect(readImageMetadata(buffer)).toEqual({ format: 'bmp', width: 640, height: 480 })
    })
  })

  describe.each([
    ['PNG', () => buildPng(0x7fffffff, 0x7fffffff), { format: 'png', width: 0x7fffffff, height: 0x7fffffff }],
    ['JPEG', () => buildJpeg(65535, 65535), { format: 'jpeg', width: 65535, height: 65535 }],
    ['WebP VP8', () => buildWebpVp8(16383, 16383), { format: 'webp', width: 16383, height: 16383 }],
    ['WebP VP8L', () => buildWebpVp8l(16384, 16384), { format: 'webp', width: 16384, height: 16384 }],
    ['WebP VP8X', () => buildWebpVp8x(0x1000000, 0x1000000), { format: 'webp', width: 0x1000000, height: 0x1000000 }],
    ['GIF', () => buildGif(65535, 65535), { format: 'gif', width: 65535, height: 65535 }],
    ['BMP (BIH)', () => buildBmp(0x7fffffff, 0x7fffffff), { format: 'bmp', width: 0x7fffffff, height: 0x7fffffff }],
    ['BMP (BCH)', () => buildBmpCoreHeader(65535, 65535), { format: 'bmp', width: 65535, height: 65535 }]
  ])('and the buffer is a %s image at the format maximum dimensions', (_label, build, expected) => {
    it('should return the maximum without overflow', () => {
      expect(readImageMetadata(build())).toEqual(expected)
    })
  })

  describe.each([
    ['PNG', () => buildPng(1, 1), { format: 'png', width: 1, height: 1 }],
    ['JPEG', () => buildJpeg(1, 1), { format: 'jpeg', width: 1, height: 1 }],
    ['WebP VP8', () => buildWebpVp8(1, 1), { format: 'webp', width: 1, height: 1 }],
    ['WebP VP8L', () => buildWebpVp8l(1, 1), { format: 'webp', width: 1, height: 1 }],
    ['WebP VP8X', () => buildWebpVp8x(1, 1), { format: 'webp', width: 1, height: 1 }],
    ['GIF', () => buildGif(1, 1), { format: 'gif', width: 1, height: 1 }],
    ['BMP (BIH)', () => buildBmp(1, 1), { format: 'bmp', width: 1, height: 1 }],
    ['BMP (BCH)', () => buildBmpCoreHeader(1, 1), { format: 'bmp', width: 1, height: 1 }]
  ])('and the buffer is a %s image at 1x1', (_label, build, expected) => {
    it('should return width and height of 1', () => {
      expect(readImageMetadata(build())).toEqual(expected)
    })
  })

  describe('and a PNG/JPEG/GIF/BMP buffer has zero width and height', () => {
    it('should throw with a non-positive-dimensions error', () => {
      expect(() => readImageMetadata(buildPng(0, 0))).toThrow('Malformed png: non-positive width 0')
      expect(() => readImageMetadata(buildJpeg(0, 0))).toThrow('Malformed jpeg: non-positive width 0')
      expect(() => readImageMetadata(buildGif(0, 0))).toThrow('Malformed gif: non-positive width 0')
      expect(() => readImageMetadata(buildBmp(0, 0))).toThrow('Malformed bmp: non-positive width 0')
    })
  })

  describe('and a BMP buffer has a negative width', () => {
    it('should throw because negative widths are illegal per BMP spec', () => {
      expect(() => readImageMetadata(buildBmp(-1, 100))).toThrow('Malformed bmp: non-positive width -1')
    })
  })

  describe('and a BMP buffer has the smallest int32 height (top-down DIB extreme)', () => {
    it('should return the absolute height as a finite Number', () => {
      const result = readImageMetadata(buildBmp(100, -0x80000000))
      expect(result.format).toBe('bmp')
      expect(result.width).toBe(100)
      expect(result.height).toBe(0x80000000)
      expect(Number.isFinite(result.height)).toBe(true)
    })
  })

  describe('and a JPEG has multiple SOFn markers', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      const sof0 = Buffer.alloc(19)
      sof0.writeUInt8(0xff, 0)
      sof0.writeUInt8(0xc0, 1)
      sof0.writeUInt16BE(17, 2)
      sof0.writeUInt8(8, 4)
      sof0.writeUInt16BE(100, 5)
      sof0.writeUInt16BE(100, 7)
      sof0.writeUInt8(3, 9)
      const sof2 = Buffer.alloc(19)
      sof2.writeUInt8(0xff, 0)
      sof2.writeUInt8(0xc2, 1)
      sof2.writeUInt16BE(17, 2)
      sof2.writeUInt8(8, 4)
      sof2.writeUInt16BE(200, 5)
      sof2.writeUInt16BE(200, 7)
      sof2.writeUInt8(3, 9)
      metadata = readImageMetadata(Buffer.concat([Buffer.from([0xff, 0xd8]), sof0, sof2, Buffer.from([0xff, 0xd9])]))
    })

    it('should return dimensions from the first SOFn encountered', () => {
      expect(metadata).toEqual({ format: 'jpeg', width: 100, height: 100 })
    })
  })

  describe('and a JPEG has a maximum-length non-SOF segment before the SOFn', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      // APP0 segment with length 0xFFFF (the maximum) — 2 marker bytes
      // + 65535 bytes of segment payload (incl. the 2 length bytes themselves).
      const app0 = Buffer.alloc(2 + 65535)
      app0.writeUInt8(0xff, 0)
      app0.writeUInt8(0xe0, 1)
      app0.writeUInt16BE(65535, 2)
      const sof = Buffer.alloc(19)
      sof.writeUInt8(0xff, 0)
      sof.writeUInt8(0xc0, 1)
      sof.writeUInt16BE(17, 2)
      sof.writeUInt8(8, 4)
      sof.writeUInt16BE(64, 5)
      sof.writeUInt16BE(48, 7)
      sof.writeUInt8(3, 9)
      metadata = readImageMetadata(Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]))
    })

    it('should skip past the APP0 segment and find the SOFn', () => {
      expect(metadata).toEqual({ format: 'jpeg', width: 48, height: 64 })
    })
  })

  describe('and a JPEG has a long chain of minimum-length non-SOF segments before the SOFn', () => {
    let metadata: ReturnType<typeof readImageMetadata>

    beforeEach(() => {
      // 100 APP0 segments, each with the minimum legal length of 2 (just the
      // length field, no payload).
      const segments: Buffer[] = [Buffer.from([0xff, 0xd8])]
      for (let i = 0; i < 100; i++) {
        const seg = Buffer.alloc(4)
        seg.writeUInt8(0xff, 0)
        seg.writeUInt8(0xe0, 1)
        seg.writeUInt16BE(2, 2)
        segments.push(seg)
      }
      const sof = Buffer.alloc(19)
      sof.writeUInt8(0xff, 0)
      sof.writeUInt8(0xc0, 1)
      sof.writeUInt16BE(17, 2)
      sof.writeUInt8(8, 4)
      sof.writeUInt16BE(7, 5)
      sof.writeUInt16BE(11, 7)
      sof.writeUInt8(3, 9)
      segments.push(sof)
      segments.push(Buffer.from([0xff, 0xd9]))
      metadata = readImageMetadata(Buffer.concat(segments))
    })

    it('should walk every segment and still find the SOFn', () => {
      expect(metadata).toEqual({ format: 'jpeg', width: 11, height: 7 })
    })
  })

  describe('and a WebP starts with a non-VP8/VP8L/VP8X chunk (non-spec encoder)', () => {
    it('should throw unknown-variant — known limitation, no chunk walking', () => {
      const buffer = Buffer.alloc(30)
      buffer.write('RIFF', 0, 'ascii')
      buffer.writeUInt32LE(22, 4)
      buffer.write('WEBP', 8, 'ascii')
      buffer.write('ICCP', 12, 'ascii')
      expect(() => readImageMetadata(buffer)).toThrow("Malformed WebP: unknown variant 'ICCP'")
    })
  })

  describe('and a PNG has high-bit bytes that would mask to IHDR via toString(ascii)', () => {
    it('should reject byte-for-byte: 0xC9 0xC8 0xC4 0xD2 is not the same as IHDR', () => {
      // Buffer.toString('ascii') strips the high bit of each byte, so
      // [0xC9, 0xC8, 0xC4, 0xD2] would decode as "IHDR" — a parser
      // differential vs. real PNG readers that compare bytes literally.
      const png = buildPng(64, 64)
      png[12] = 0xc9
      png[13] = 0xc8
      png[14] = 0xc4
      png[15] = 0xd2
      expect(() => readImageMetadata(png)).toThrow('Malformed PNG: missing IHDR chunk')
    })
  })

  describe('and a PNG chunk type uses high-bit bytes that would mask to IEND', () => {
    // Build a 12-byte chunk (length + type + crc) whose type bytes
    // [0xC9, 0xC5, 0xCE, 0xC4] mask to "IEND" via toString('ascii').
    const buildMasqueradeIendChunk = (): Buffer => {
      const chunk = Buffer.alloc(12)
      chunk.writeUInt32BE(0, 0)
      chunk.writeUInt8(0xc9, 4)
      chunk.writeUInt8(0xc5, 5)
      chunk.writeUInt8(0xce, 6)
      chunk.writeUInt8(0xc4, 7)
      return chunk
    }

    it('should not treat the masqueraded chunk as IEND and should continue walking', () => {
      const png = buildPng(64, 64, { extraChunks: buildMasqueradeIendChunk() })
      // Real IEND is still present at the end, so the walker should reach it.
      expect(readImageMetadata(png)).toEqual({ format: 'png', width: 64, height: 64 })
    })

    it('should report missing IEND when the masqueraded chunk is the only candidate', () => {
      const png = buildPng(64, 64, { extraChunks: buildMasqueradeIendChunk(), omitIend: true })
      expect(() => readImageMetadata(png)).toThrow('Malformed PNG: missing IEND chunk')
    })
  })

  describe('and a WebP variant uses high-bit bytes that would mask to VP8/VP8L/VP8X', () => {
    it('should treat 0xD6 0xD0 0xB8 0xA0 as an unknown variant, not as VP8 ', () => {
      // 'V' = 0x56, 'P' = 0x50, '8' = 0x38, ' ' = 0x20 — adding 0x80 to each
      // produces bytes that toString('ascii') would decode as "VP8 ".
      const buffer = Buffer.alloc(30)
      buffer.write('RIFF', 0, 'ascii')
      buffer.writeUInt32LE(22, 4)
      buffer.write('WEBP', 8, 'ascii')
      buffer.writeUInt8(0xd6, 12)
      buffer.writeUInt8(0xd0, 13)
      buffer.writeUInt8(0xb8, 14)
      buffer.writeUInt8(0xa0, 15)
      // Sanitiser replaces non-printable bytes with '?', so the error message
      // contains '????' rather than the raw bytes.
      expect(() => readImageMetadata(buffer)).toThrow("Malformed WebP: unknown variant '????'")
    })
  })

  describe('and a buffer has high-bit bytes that would mask to the RIFF/WEBP magic', () => {
    it('should not be detected as WebP', () => {
      const buffer = Buffer.alloc(30)
      // 0xD2 0xC9 0xC6 0xC6 -> "RIFF" via toString('ascii'); 0xD7 0xC5 0xC2 0xD0 -> "WEBP".
      buffer.writeUInt8(0xd2, 0)
      buffer.writeUInt8(0xc9, 1)
      buffer.writeUInt8(0xc6, 2)
      buffer.writeUInt8(0xc6, 3)
      buffer.writeUInt32LE(22, 4)
      buffer.writeUInt8(0xd7, 8)
      buffer.writeUInt8(0xc5, 9)
      buffer.writeUInt8(0xc2, 10)
      buffer.writeUInt8(0xd0, 11)
      buffer.write('VP8 ', 12, 'ascii')
      expect(() => readImageMetadata(buffer)).toThrow('Unsupported image format')
    })
  })

  describe('and a buffer has high-bit bytes that would mask to the GIF89a signature', () => {
    it('should not be detected as a GIF', () => {
      // 'G' 0x47 + 0x80 = 0xC7; 'I' 0x49 + 0x80 = 0xC9; 'F' 0x46 + 0x80 = 0xC6;
      // '8' 0x38 + 0x80 = 0xB8; '9' 0x39 + 0x80 = 0xB9; 'a' 0x61 + 0x80 = 0xE1.
      const buffer = Buffer.alloc(14)
      buffer.writeUInt8(0xc7, 0)
      buffer.writeUInt8(0xc9, 1)
      buffer.writeUInt8(0xc6, 2)
      buffer.writeUInt8(0xb8, 3)
      buffer.writeUInt8(0xb9, 4)
      buffer.writeUInt8(0xe1, 5)
      buffer.writeUInt16LE(64, 6)
      buffer.writeUInt16LE(48, 8)
      buffer.writeUInt8(0x3b, 13)
      expect(() => readImageMetadata(buffer)).toThrow('Unsupported image format')
    })
  })

  describe('and the PNG IHDR declares a non-zero compression method', () => {
    it('should throw with an invalid-compression-method message', () => {
      expect(() => readImageMetadata(buildPng(64, 64, { compressionMethod: 1 }))).toThrow(
        'Malformed PNG: invalid compression method 1'
      )
    })
  })

  describe('and the PNG IHDR declares a non-zero filter method', () => {
    it('should throw with an invalid-filter-method message', () => {
      expect(() => readImageMetadata(buildPng(64, 64, { filterMethod: 2 }))).toThrow(
        'Malformed PNG: invalid filter method 2'
      )
    })
  })

  describe('and the PNG IHDR declares an interlace method other than 0 or 1', () => {
    it('should throw with an invalid-interlace-method message', () => {
      expect(() => readImageMetadata(buildPng(64, 64, { interlaceMethod: 2 }))).toThrow(
        'Malformed PNG: invalid interlace method 2'
      )
    })
  })

  describe('and the PNG IHDR declares Adam7 interlace (method 1)', () => {
    it('should accept the buffer because Adam7 is spec-allowed', () => {
      expect(readImageMetadata(buildPng(64, 64, { interlaceMethod: 1 }))).toEqual({
        format: 'png',
        width: 64,
        height: 64
      })
    })
  })

  describe('and a PNG chunk declares a length with the high bit set', () => {
    it('should throw because the spec caps chunk length at 2^31-1', () => {
      const overlong = Buffer.alloc(12)
      overlong.writeUInt32BE(0x80000000, 0)
      overlong.write('iTXt', 4, 'ascii')
      expect(() => readImageMetadata(buildPng(64, 64, { extraChunks: overlong }))).toThrow(
        'Malformed PNG: chunk length exceeds 2^31-1'
      )
    })

    it('should also reject the maximum 2^32-1 length', () => {
      const overlong = Buffer.alloc(12)
      overlong.writeUInt32BE(0xffffffff, 0)
      overlong.write('iTXt', 4, 'ascii')
      expect(() => readImageMetadata(buildPng(64, 64, { extraChunks: overlong }))).toThrow(
        'Malformed PNG: chunk length exceeds 2^31-1'
      )
    })
  })

  describe('and the WebP VP8L signature byte is not 0x2F', () => {
    it('should throw with an invalid-VP8L-signature message', () => {
      const tampered = buildWebpVp8l(64, 48)
      tampered.writeUInt8(0x00, 20)
      expect(() => readImageMetadata(tampered)).toThrow('Malformed WebP: invalid VP8L signature byte')
    })
  })

  describe('and a JPEG hits SOS without a SOFn marker', () => {
    it('should throw because SOFn must precede SOS in any valid JPEG', () => {
      // SOI + APP0 + SOS + (entropy stub) + EOI. The parser must not walk
      // entropy data hunting for SOFn — break out at SOS.
      const buffer = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xda, 0x00, 0x08, 0, 0, 0, 0, 0,
        0, 0, 0, 0xff, 0xd9
      ])
      expect(() => readImageMetadata(buffer)).toThrow('Malformed JPEG: no SOFn marker found')
    })
  })

  describe('and the BMP file-size header does not match the buffer length', () => {
    it('should throw with a file-size mismatch message', () => {
      const tampered = buildBmp(64, 48)
      tampered.writeUInt32LE(99, 2)
      expect(() => readImageMetadata(tampered)).toThrow('Malformed BMP: file size header does not match buffer length')
    })
  })

  describe('and the input is a corpus of seeded random buffers', () => {
    const lcg = (seed: number) => {
      let state = seed >>> 0
      return () => {
        state = ((state * 1664525) >>> 0) + 1013904223
        state = state >>> 0
        return state
      }
    }
    const randomBuffer = (rng: () => number, length: number): Buffer => {
      const buf = Buffer.alloc(length)
      for (let i = 0; i < length; i++) buf[i] = rng() & 0xff
      return buf
    }

    it('should never crash, hang, or return non-finite dimensions across 1000 random buffers', () => {
      const rng = lcg(0xdeadbeef)
      for (let trial = 0; trial < 1000; trial++) {
        const length = (rng() % 2048) + 1
        const buf = randomBuffer(rng, length)
        try {
          const result = readImageMetadata(buf)
          expect(typeof result.format).toBe('string')
          expect(Number.isFinite(result.width)).toBe(true)
          expect(Number.isFinite(result.height)).toBe(true)
          expect(Number.isInteger(result.width)).toBe(true)
          expect(Number.isInteger(result.height)).toBe(true)
        } catch (err) {
          expect(err).toBeInstanceOf(Error)
        }
      }
    })

    it('should never crash on 500 mutated copies of valid buffers', () => {
      const rng = lcg(0xfeedface)
      const corpus: Buffer[] = [
        buildPng(1024, 1024),
        buildJpeg(800, 600),
        buildWebpVp8(640, 480),
        buildWebpVp8l(320, 240),
        buildWebpVp8x(1920, 1080),
        buildGif(256, 256),
        buildBmp(100, 100),
        buildBmpCoreHeader(50, 50)
      ]
      for (let trial = 0; trial < 500; trial++) {
        const base = corpus[rng() % corpus.length]
        const copy = Buffer.from(base)
        const flips = (rng() % 5) + 1
        for (let f = 0; f < flips; f++) {
          copy[rng() % copy.length] = rng() & 0xff
        }
        try {
          const result = readImageMetadata(copy)
          expect(typeof result.format).toBe('string')
          expect(Number.isFinite(result.width)).toBe(true)
          expect(Number.isFinite(result.height)).toBe(true)
        } catch (err) {
          expect(err).toBeInstanceOf(Error)
        }
      }
    })
  })
})
