import type { Entity, Outfit, Outfits } from '@dcl/schemas'
import { EntityType } from '@dcl/schemas'
import { createItemsOwnershipWith, createNamesOwnershipWith } from './mock'
import {
  createOutfitsNamesOwnershipValidateFn,
  createOutfitsWearablesOwnershipValidateFn
} from '../../../src/validations/access/common/outfits'
import { buildDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

type TypedEntity<T> = Entity & { metadata: T }

const OWNER_ADDRESS = '0x12e7f74e73e951c61edd80910e46c3fece512345'
const SAMPLE_ENTITY_ID = 'bafybeihz4c4cf4icnlh6yjtt7fooaeih3dkv2mz6umod7dybenzmsxkzvq'
const BASE_OUTFIT: Omit<Outfit, 'wearables'> = {
  bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
  eyes: { color: { r: 0.23046875, g: 0.625, b: 0.3125 } },
  hair: { color: { r: 0.35546875, g: 0.19140625, b: 0.05859375 } },
  skin: { color: { r: 0.94921875, g: 0.76171875, b: 0.6484375 } }
}

const outfitWithWearables = (slot: number, ...wearables: string[]): Outfits['outfits'][0] => ({
  slot,
  outfit: { ...BASE_OUTFIT, wearables }
})

const buildOutfitsEntity = (metadata: Outfits): TypedEntity<Outfits> => ({
  version: '3',
  type: EntityType.OUTFITS,
  pointers: [`${OWNER_ADDRESS}:outfits`],
  timestamp: Date.now(),
  content: [],
  id: SAMPLE_ENTITY_ID,
  metadata
})

describe('when validating outfit wearables ownership', () => {
  const wearable0 = 'urn:decentraland:off-chain:base-avatars:wearable0'
  const wearable1 = 'urn:decentraland:off-chain:base-avatars:wearable1'
  const wearable2 = 'urn:decentraland:off-chain:base-avatars:wearable2'

  describe('and all the wearables in the outfits are owned by the signer', () => {
    let result: ValidationResponse
    let ownsItemsSpy: jest.SpyInstance

    beforeEach(async () => {
      const entity = buildOutfitsEntity({
        outfits: [outfitWithWearables(0, wearable0), outfitWithWearables(1, wearable1)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => OWNER_ADDRESS
      })
      const itemsOwnership = createItemsOwnershipWith(OWNER_ADDRESS, [wearable0, wearable1, wearable2])
      ownsItemsSpy = jest.spyOn(itemsOwnership, 'ownsItemsAtTimestamp')
      const validateFn = createOutfitsWearablesOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the items ownership service and return ok', () => {
      expect(ownsItemsSpy).toHaveBeenCalled()
      expect(result.ok).toBe(true)
    })
  })

  describe('and at least one outfit wearable is not owned by the signer', () => {
    let result: ValidationResponse
    let ownsItemsSpy: jest.SpyInstance

    beforeEach(async () => {
      const entity = buildOutfitsEntity({
        outfits: [outfitWithWearables(0, wearable0), outfitWithWearables(1, wearable1)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => OWNER_ADDRESS
      })
      const itemsOwnership = createItemsOwnershipWith(OWNER_ADDRESS, [wearable0, wearable2])
      ownsItemsSpy = jest.spyOn(itemsOwnership, 'ownsItemsAtTimestamp')
      const validateFn = createOutfitsWearablesOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return an error listing the unowned wearable', () => {
      expect(ownsItemsSpy).toHaveBeenCalled()
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual(
        `The following wearables (${wearable1}) are not owned by the address ${OWNER_ADDRESS}.`
      )
    })
  })
})

describe('when validating outfit names ownership', () => {
  describe('and all the names for extra slots are owned by the signer', () => {
    let result: ValidationResponse
    let ownsNamesSpy: jest.SpyInstance

    beforeEach(async () => {
      const entity = buildOutfitsEntity({ outfits: [], namesForExtraSlots: ['name1', 'name2'] })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => OWNER_ADDRESS
      })
      const namesOwnership = createNamesOwnershipWith(OWNER_ADDRESS, ['name1', 'name2', 'name3'])
      ownsNamesSpy = jest.spyOn(namesOwnership, 'ownsNamesAtTimestamp')
      const validateFn = createOutfitsNamesOwnershipValidateFn({ externalCalls }, namesOwnership)
      result = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the names ownership service and return ok', () => {
      expect(ownsNamesSpy).toHaveBeenCalled()
      expect(result.ok).toBe(true)
    })
  })

  describe('and at least one name is not owned by the signer', () => {
    let result: ValidationResponse
    let ownsNamesSpy: jest.SpyInstance

    beforeEach(async () => {
      const entity = buildOutfitsEntity({ outfits: [], namesForExtraSlots: ['name1', 'name2'] })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => OWNER_ADDRESS
      })
      const namesOwnership = createNamesOwnershipWith(OWNER_ADDRESS, ['name2', 'name3'])
      ownsNamesSpy = jest.spyOn(namesOwnership, 'ownsNamesAtTimestamp')
      const validateFn = createOutfitsNamesOwnershipValidateFn({ externalCalls }, namesOwnership)
      result = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return an error listing the unowned name', () => {
      expect(ownsNamesSpy).toHaveBeenCalled()
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual(`The following names (name1) are not owned by the address ${OWNER_ADDRESS}.`)
    })
  })
})
