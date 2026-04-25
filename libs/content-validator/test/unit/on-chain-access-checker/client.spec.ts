import { createTestMetricsComponent } from '@well-known-components/metrics'
import { createAvlBlockSearch, metricsDefinitions } from '@dcl/block-indexer'
import {
  buildOnChainAccessCheckerComponents,
  createMockBlockRepository,
  createMockThirdPartyItemCheckerComponent
} from './mock'
import { timestampBounds } from '../../../src/validations/access/on-chain/client'
import { createMockItemCheckerComponent } from '../../setup/mock'

const currentTimestamp = 1000
const bounds = timestampBounds(currentTimestamp)

const fallbackToLowerBound = (t: number) => {
  if (t === bounds.upper) return undefined
  return { timestamp: bounds.lower, block: 123400 }
}

const useUpperOrLowerBlock = (t: number) => {
  if (t === bounds.upper) return { timestamp: bounds.upper, block: 123500 }
  return { timestamp: bounds.lower, block: 123400 }
}

describe('when querying the on-chain client', () => {
  describe('and the underlying graph throws while looking up names', () => {
    let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

    beforeEach(() => {
      components = buildOnChainAccessCheckerComponents()
      components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(() => {
        throw new Error('error')
      })
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should propagate the error to the caller', async () => {
      await expect(components.client.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).rejects.toThrow('error')
    })
  })

  describe('and findBlocksForTimestamp returns no matching block', () => {
    let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

    beforeEach(() => {
      components = buildOnChainAccessCheckerComponents()
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should reject with a "Block 0 could not be retrieved" error', async () => {
      await expect(components.client.findBlocksForTimestamp(10, components.L1.blockSearch)).rejects.toThrow(
        'Block 0 could not be retrieved'
      )
    })
  })

  describe('and the client checks name ownership', () => {
    describe('and there is no block for the current timestamp', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.blockSearch = createAvlBlockSearch({
          logs: components.logs,
          metrics: createTestMetricsComponent(metricsDefinitions),
          blockRepository: createMockBlockRepository(10, {})
        })
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation((t) => {
          if (t === bounds.upper) return undefined
          return { timestamp: bounds.lower, block: 123400 }
        })
        components.L1.checker.checkNames = jest.fn((_ethAddress, _name, block) => Promise.resolve([block === 123400]))
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should fall back to the block from 5 minutes earlier and return ownership', async () => {
        await expect(components.client.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).resolves.toEqual({
          result: true
        })
      })
    })

    describe('and the current block has not been indexed yet', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation((t) => {
          if (t === bounds.upper) return { timestamp: bounds.upper, block: 123500 }
          return { timestamp: bounds.lower, block: 123400 }
        })
        components.L1.checker.checkNames = jest.fn((_ethAddress, _name, block) => Promise.resolve([block === 123400]))
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should fall back to the previous block and return ownership', async () => {
        await expect(components.client.ownsNamesAtTimestamp('0x1', ['Some Name'], currentTimestamp)).resolves.toEqual({
          result: true
        })
      })
    })

    describe('and neither the current nor the 5-min earlier block is indexed', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(() => undefined)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report that the address does not own the name', async () => {
        await expect(components.client.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).resolves.toEqual({
          result: false
        })
      })
    })
  })

  describe('and the client checks wearable ownership', () => {
    describe('and there is no block for the current timestamp', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([true]))
        components.L2.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([true]))
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
        components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should fall back to the lower-bound block and report ownership', async () => {
        await expect(
          components.client.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:123',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
            ],
            10
          )
        ).resolves.toEqual({ result: true })
      })
    })

    describe('and the current block has not been indexed yet', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.collections = createMockItemCheckerComponent(
          jest.fn().mockImplementation(async (_query, variables) => {
            if (variables['block'] === 123500) return Promise.reject('error')
            return Promise.resolve([true])
          })
        )
        components.L2.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([true]))
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(useUpperOrLowerBlock)
        components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(useUpperOrLowerBlock)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should retry against the previous block and report ownership', async () => {
        await expect(
          components.client.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
            ],
            currentTimestamp
          )
        ).resolves.toEqual({ result: true })
      })
    })

    describe('and both the current and 5-min earlier subgraph queries fail', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.collections = createMockItemCheckerComponent(jest.fn().mockRejectedValue('error'))
        components.L2.collections = createMockItemCheckerComponent(jest.fn().mockRejectedValue('error'))
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(useUpperOrLowerBlock)
        components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(useUpperOrLowerBlock)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report no ownership and an empty failing list', async () => {
        await expect(
          components.client.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:4',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
            ],
            currentTimestamp
          )
        ).resolves.toEqual({ result: false, failing: [] })
      })
    })

    describe('and the URNs are valid v1 and v2 wearables', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([true]))
        components.L2.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([true]))
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
        components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it.each([
        [
          'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
          'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
        ],
        [
          'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:123',
          'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2:321'
        ]
      ])('should report ownership for the (%s, %s) pair', async (l1UrnToValidate, l2UrnToValidate) => {
        await expect(
          components.client.ownsItemsAtTimestamp('0x1', [l1UrnToValidate, l2UrnToValidate], 10)
        ).resolves.toEqual({ result: true })
      })
    })

    describe('and the wearable URNs include invalid token ids', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
        components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report both URNs as failing', async () => {
        await expect(
          components.client.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:124',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2:124'
            ],
            10
          )
        ).resolves.toEqual({
          result: false,
          failing: [
            'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:124',
            'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2:124'
          ]
        })
      })
    })

    describe('and a single wearable has an invalid token id', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(() => {
        components = buildOnChainAccessCheckerComponents()
        components.L1.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([true]))
        components.L2.collections = createMockItemCheckerComponent(jest.fn().mockResolvedValue([false]))
        components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
        components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report only the invalid wearable as failing', async () => {
        await expect(
          components.client.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:123',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2:124'
            ],
            10
          )
        ).resolves.toEqual({
          result: false,
          failing: ['urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2:124']
        })
      })
    })

    describe('and the URNs are third-party wearables', () => {
      describe('and ownership of v1 and v2 third-party wearables is verified', () => {
        let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

        beforeEach(() => {
          components = buildOnChainAccessCheckerComponents()
          components.L1.thirdParty = createMockThirdPartyItemCheckerComponent(jest.fn().mockResolvedValue([true]))
          components.L2.thirdParty = createMockThirdPartyItemCheckerComponent(jest.fn().mockResolvedValue([true]))
          components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
          components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
        })

        afterEach(() => {
          jest.resetAllMocks()
        })

        it.each([
          [
            'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:sepolia-8a50:f-bananacrown-4685',
            'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:amoy-eb54:earrings-9d5c'
          ],
          [
            'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:sepolia-8a50:f-bananacrown-4685:sepolia:0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c:7',
            'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:amoy-eb54:earrings-9d5c:amoy:0x1d9fb685c257e74f869ba302e260c0b68f5ebb37:8'
          ]
        ])('should report ownership for the (%s, %s) pair', async (l1UrnToValidate, l2UrnToValidate) => {
          await expect(
            components.client.ownsItemsAtTimestamp('0x1', [l1UrnToValidate, l2UrnToValidate], 10)
          ).resolves.toEqual({ result: true })
        })
      })

      describe('and a third-party v2 wearable has an invalid token id', () => {
        let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

        beforeEach(() => {
          components = buildOnChainAccessCheckerComponents()
          components.L1.thirdParty = createMockThirdPartyItemCheckerComponent(jest.fn().mockResolvedValue([true]))
          components.L2.thirdParty = createMockThirdPartyItemCheckerComponent(jest.fn().mockResolvedValue([false]))
          components.L1.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
          components.L2.blockSearch.findBlockForTimestamp = jest.fn().mockImplementation(fallbackToLowerBound)
        })

        afterEach(() => {
          jest.resetAllMocks()
        })

        it('should report only the invalid third-party wearable as failing', async () => {
          await expect(
            components.client.ownsItemsAtTimestamp(
              '0x1',
              [
                'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:sepolia-8a50:f-bananacrown-4685:sepolia:0x74c78f5a4ab22f01d5fd08455cf0ff5c3367535c:7',
                'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:amoy-eb54:earrings-9d5c:amoy:0x1d9fb685c257e74f869ba302e260c0b68f5ebb37:8'
              ],
              10
            )
          ).resolves.toEqual({
            result: false,
            failing: [
              'urn:decentraland:amoy:collections-thirdparty:back-to-the-future:amoy-eb54:earrings-9d5c:amoy:0x1d9fb685c257e74f869ba302e260c0b68f5ebb37:8'
            ]
          })
        })
      })
    })
  })
})
