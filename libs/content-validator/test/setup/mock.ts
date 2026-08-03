import type { ILoggerComponent } from '@well-known-components/interfaces'
import type { ISubgraphComponent, Variables } from '@well-known-components/thegraph-component'
import type { ContentValidatorComponents, ExternalCalls, ItemChecker, ValidateFn } from '../../src'

export type QueryGraph = <T = unknown>(query: string, variables?: Variables, remainingAttempts?: number) => Promise<T>

const noop = (): void => {
  // intentionally empty: tests don't need to capture log output
}

export const buildLogger = (): ILoggerComponent => ({
  getLogger: () => ({
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    log: noop
  })
})

export function buildComponents(components?: Partial<ContentValidatorComponents>): ContentValidatorComponents {
  return {
    logs: components?.logs ?? buildLogger(),
    externalCalls: components?.externalCalls ?? buildExternalCalls(),
    accessValidateFn: components?.accessValidateFn ?? (jest.fn() as jest.MockedFunction<ValidateFn>)
  }
}

export function buildExternalCalls(externalCalls?: Partial<ExternalCalls>): ExternalCalls {
  return {
    isContentStoredAlready: () => Promise.resolve(new Map()),
    fetchContentFileSize: () => Promise.resolve(undefined),
    validateSignature: () => Promise.resolve({ ok: true }),
    ownerAddress: () => '',
    isAddressOwnedByDecentraland: () => false,
    calculateFilesHashes: async (files: Map<string, Uint8Array>) => {
      const resultMap = new Map()
      for (const [key, value] of files.entries()) {
        resultMap.set(key, { calculatedHash: 'hash', buffer: value })
      }
      return resultMap
    },
    ...externalCalls
  }
}

export const createMockSubgraphComponent = (mock?: QueryGraph): ISubgraphComponent => ({
  query: mock ?? (jest.fn() as jest.MockedFunction<QueryGraph>)
})

export const createMockItemCheckerComponent = (
  mock?: (ethAddress: string, items: string[], block: number) => Promise<boolean[]>
): ItemChecker => ({
  checkItems:
    mock ??
    (
      jest.fn() as jest.MockedFunction<(ethAddress: string, items: string[], block: number) => Promise<boolean[]>>
    ).mockResolvedValue([false])
})

/**
 * Builds a minimal valid-enough image buffer for the thumbnail validations
 * to read its format and dimensions. The validations only inspect headers
 * (PNG signature + IHDR, or JPEG SOF0), so we don't need a real image.
 */
export const createImage = async (size: number, format: 'png' | 'jpg' = 'png'): Promise<Buffer> => {
  return Promise.resolve(format === 'png' ? buildPngWithDimensions(size, size) : buildJpegWithDimensions(size, size))
}

function buildPngWithDimensions(width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdrLength = Buffer.alloc(4)
  ihdrLength.writeUInt32BE(13, 0)
  const ihdrType = Buffer.from('IHDR', 'ascii')
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData.writeUInt8(8, 8)
  ihdrData.writeUInt8(6, 9)
  const ihdrCrc = Buffer.alloc(4)
  ihdrCrc.writeUInt32BE(crc32(Buffer.concat([ihdrType, ihdrData])), 0)
  const iendLength = Buffer.alloc(4)
  const iendType = Buffer.from('IEND', 'ascii')
  const iendCrc = Buffer.alloc(4)
  iendCrc.writeUInt32BE(crc32(iendType), 0)
  return Buffer.concat([signature, ihdrLength, ihdrType, ihdrData, ihdrCrc, iendLength, iendType, iendCrc])
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[i] = c
  }
  return table
})()

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buffer.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buffer[i]) & 0xff]
  }
  return (crc ^ 0xffffffff) >>> 0
}

function buildJpegWithDimensions(width: number, height: number): Buffer {
  const sof0Length = 17
  const sof0 = Buffer.alloc(2 + sof0Length)
  sof0.writeUInt8(0xff, 0)
  sof0.writeUInt8(0xc0, 1)
  sof0.writeUInt16BE(sof0Length, 2)
  sof0.writeUInt8(8, 4)
  sof0.writeUInt16BE(height, 5)
  sof0.writeUInt16BE(width, 7)
  sof0.writeUInt8(3, 9)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof0, Buffer.from([0xff, 0xd9])])
}
