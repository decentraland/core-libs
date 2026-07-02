import { buildSubGraphs, buildSubgraphAccessCheckerComponents } from './mock'
import { createMockSubgraphComponent } from '../../setup/mock'

describe('when querying TheGraph client', () => {
  describe('and the underlying subgraph throws while looking up names', () => {
    let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

    beforeEach(() => {
      const subGraphs = buildSubGraphs({
        L1: {
          collections: createMockSubgraphComponent(),
          blocks: createMockSubgraphComponent(
            jest.fn().mockImplementation(() => {
              throw new Error('error')
            })
          ),
          landManager: createMockSubgraphComponent(),
          ensOwner: createMockSubgraphComponent()
        }
      })
      theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should propagate the error to the caller', async () => {
      await expect(theGraphClient.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).rejects.toThrow('error')
    })
  })

  describe('and findBlocksForTimestamp returns no matching block', () => {
    let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']
    let subGraphs: ReturnType<typeof buildSubGraphs>

    beforeEach(() => {
      subGraphs = buildSubGraphs({
        L1: {
          collections: createMockSubgraphComponent(),
          blocks: createMockSubgraphComponent(jest.fn().mockResolvedValueOnce({ max: [], min: [] })),
          landManager: createMockSubgraphComponent(),
          ensOwner: createMockSubgraphComponent()
        }
      })
      theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should reject with a "Failed to find blocks" error', async () => {
      await expect(theGraphClient.findBlocksForTimestamp(subGraphs.L1.blocks, 10)).rejects.toThrow(
        'Failed to find blocks for the specific timestamp'
      )
    })
  })

  describe('and findBlocksForTimestamp returns both upper and lower blocks', () => {
    let result: { blockNumberAtDeployment: number | undefined; blockNumberFiveMinBeforeDeployment: number | undefined }

    beforeEach(async () => {
      const subGraphs = buildSubGraphs({
        L1: {
          collections: createMockSubgraphComponent(),
          blocks: createMockSubgraphComponent(
            jest.fn().mockResolvedValueOnce({
              max: [{ number: '200' }],
              min: [{ number: '100' }]
            })
          ),
          landManager: createMockSubgraphComponent(),
          ensOwner: createMockSubgraphComponent()
        }
      })
      const { theGraphClient } = buildSubgraphAccessCheckerComponents({ subGraphs })
      result = await theGraphClient.findBlocksForTimestamp(subGraphs.L1.blocks, 10)
    })

    it('should set the deployment block to the max returned by the subgraph', () => {
      expect(result.blockNumberAtDeployment).toBe(200)
    })

    it('should set the five-minutes-before block to the min returned by the subgraph', () => {
      expect(result.blockNumberFiveMinBeforeDeployment).toBe(100)
    })
  })

  describe('and the client checks name ownership', () => {
    describe('and there is no block for the current timestamp', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent(
              jest.fn().mockImplementation(async (_query, variables) => {
                if (variables['block'] === 123400) return { names: [{ name: 'Some Name' }] }
              })
            )
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should fall back to the lower-bound block and report ownership', async () => {
        await expect(theGraphClient.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).resolves.toEqual({
          result: true
        })
      })
    })

    describe('and the current block has not been indexed yet', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [{ number: 123500 }] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent(
              jest.fn().mockImplementation(async (_query, variables) => {
                if (variables['block'] === 123500) return Promise.reject('error')
                return { names: [{ name: 'Some Name' }] }
              })
            )
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should retry against the previous block and report ownership', async () => {
        await expect(theGraphClient.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).resolves.toEqual({
          result: true
        })
      })
    })

    describe('and both the current and 5-min earlier subgraph queries fail', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [{ number: 123500 }] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent(jest.fn().mockRejectedValue('error'))
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report that the address does not own the name', async () => {
        await expect(theGraphClient.ownsNamesAtTimestamp('0x1', ['Some Name'], 10)).resolves.toEqual({
          result: false
        })
      })
    })
  })

  describe('and the client checks wearable ownership', () => {
    describe('and the URNs are valid v1 and v2 wearables', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(
              jest.fn().mockResolvedValue({
                items: [
                  {
                    urn: 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
                    tokenId: '123'
                  }
                ]
              })
            ),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent(jest.fn().mockRejectedValue('error'))
          },
          L2: {
            thirdPartyRegistry: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [] })
            ),
            collections: createMockSubgraphComponent(
              jest.fn().mockResolvedValue({
                items: [
                  {
                    urn: 'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2',
                    tokenId: '321'
                  }
                ]
              })
            )
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
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
          theGraphClient.ownsItemsAtTimestamp('0x1', [l1UrnToValidate, l2UrnToValidate], 10)
        ).resolves.toEqual({ result: true })
      })
    })

    describe('and there is no block for the current timestamp', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(
              jest.fn().mockResolvedValue({
                items: [
                  {
                    urn: 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
                    tokenId: '123'
                  }
                ]
              })
            ),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent(jest.fn().mockRejectedValue('error'))
          },
          L2: {
            thirdPartyRegistry: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [] })
            ),
            collections: createMockSubgraphComponent(
              jest.fn().mockResolvedValue({
                items: [
                  {
                    urn: 'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2',
                    tokenId: '123'
                  }
                ]
              })
            )
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should fall back to the lower-bound block and report ownership', async () => {
        await expect(
          theGraphClient.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
            ],
            10
          )
        ).resolves.toEqual({ result: true })
      })
    })

    describe('and the current block has not been indexed yet', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(
              jest.fn().mockImplementation(async (_query, variables) => {
                if (variables['block'] === 123500) return Promise.reject('error')
                return {
                  items: [
                    {
                      urn: 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
                      tokenId: '123'
                    }
                  ]
                }
              })
            ),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [{ number: 123500 }] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent()
          },
          L2: {
            thirdPartyRegistry: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [{ number: 123500 }] })
            ),
            collections: createMockSubgraphComponent(
              jest.fn().mockResolvedValue({
                items: [
                  {
                    urn: 'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2',
                    tokenId: '123'
                  }
                ]
              })
            )
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should retry against the previous block and report ownership', async () => {
        await expect(
          theGraphClient.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
            ],
            10
          )
        ).resolves.toEqual({ result: true })
      })
    })

    describe('and both the current and 5-min earlier subgraph queries fail', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(jest.fn().mockRejectedValue('error')),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [{ number: 123500 }] })
            ),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent()
          },
          L2: {
            thirdPartyRegistry: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [{ number: 123500 }] })
            ),
            collections: createMockSubgraphComponent(jest.fn().mockRejectedValue('error'))
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report no ownership and an empty failing list', async () => {
        await expect(
          theGraphClient.ownsItemsAtTimestamp(
            '0x1',
            [
              'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet',
              'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'
            ],
            10
          )
        ).resolves.toEqual({ result: false, failing: [] })
      })
    })
  })

  describe('and the client checks third-party item ownership', () => {
    describe('and the URNs contain a third-party item', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']
      const thirdPartyUrn = 'urn:decentraland:matic:collections-thirdparty:some-third-party:some-collection:some-item'

      beforeEach(() => {
        const subGraphs = buildSubGraphs()
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should fail closed and report the third-party URN as not owned', async () => {
        await expect(theGraphClient.ownsItemsAtTimestamp('0x1', [thirdPartyUrn], 10)).resolves.toEqual({
          result: false,
          failing: [thirdPartyUrn]
        })
      })
    })

    describe('and the URNs contain only regular items owned by the signer', () => {
      let theGraphClient: ReturnType<typeof buildSubgraphAccessCheckerComponents>['theGraphClient']
      const ownedUrn = 'urn:decentraland:matic:collections-v2:0x04e7f74e73e951c61edd80910e46c3fece5ebe80:2'

      beforeEach(() => {
        const subGraphs = buildSubGraphs({
          L1: {
            collections: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(),
            landManager: createMockSubgraphComponent(),
            ensOwner: createMockSubgraphComponent()
          },
          L2: {
            thirdPartyRegistry: createMockSubgraphComponent(),
            blocks: createMockSubgraphComponent(
              jest.fn().mockResolvedValueOnce({ min: [{ number: 123400 }], max: [] })
            ),
            collections: createMockSubgraphComponent(
              jest.fn().mockResolvedValue({
                items: [{ urn: ownedUrn, tokenId: '321' }]
              })
            )
          }
        })
        theGraphClient = buildSubgraphAccessCheckerComponents({ subGraphs }).theGraphClient
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should report ownership', async () => {
        await expect(theGraphClient.ownsItemsAtTimestamp('0x1', [ownedUrn], 10)).resolves.toEqual({ result: true })
      })
    })
  })
})
