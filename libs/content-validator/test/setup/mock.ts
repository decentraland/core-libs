import sharp from 'sharp'
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

export const createImage = async (size: number, format: 'png' | 'jpg' = 'png'): Promise<Buffer> => {
  let image = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 }
    }
  })
  if (format) {
    image = format === 'png' ? image.png() : image.jpeg()
  }
  return await image.toBuffer()
}
