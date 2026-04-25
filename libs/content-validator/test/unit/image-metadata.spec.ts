import { readImageMetadata } from '../../src/image-metadata'

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const buildPng = (width: number, height: number, ihdrOverride?: string): Buffer => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(13, 0)
  const type = Buffer.from(ihdrOverride ?? 'IHDR', 'ascii')
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

  describe('and the buffer has the PNG signature but no IHDR chunk', () => {
    it('should throw with a malformed-PNG message', () => {
      expect(() => readImageMetadata(buildPng(10, 10, 'IDAT'))).toThrow('Malformed PNG: missing IHDR chunk')
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

  describe('and the buffer is too short or unrecognised', () => {
    it('should throw an unsupported-format error', () => {
      expect(() => readImageMetadata(Buffer.alloc(1))).toThrow('Unsupported image format')
      expect(() => readImageMetadata(Buffer.from([0x47, 0x49, 0x46, 0x38]))).toThrow('Unsupported image format')
    })
  })
})
