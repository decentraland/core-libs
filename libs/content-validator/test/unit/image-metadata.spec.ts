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
  // bytes 20..25: frame-tag (3) + sync code (3) — left as zeros for the test
  buffer.writeUInt16LE(width, 26)
  buffer.writeUInt16LE(height, 28)
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
  const buffer = Buffer.alloc(54)
  buffer.write('BM', 0, 'ascii')
  buffer.writeInt32LE(width, 18)
  buffer.writeInt32LE(height, 22)
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

  describe('and the buffer is too short or unrecognised', () => {
    it('should throw an unsupported-format error', () => {
      expect(() => readImageMetadata(Buffer.alloc(1))).toThrow('Unsupported image format')
      expect(() => readImageMetadata(Buffer.from([0x49, 0x49, 0x2a, 0x00]))).toThrow('Unsupported image format')
    })
  })
})
