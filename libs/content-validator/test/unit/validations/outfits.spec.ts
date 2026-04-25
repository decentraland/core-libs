import type { Entity, Outfit, Outfits } from '@dcl/schemas'
import { EntityType } from '@dcl/schemas'
import {
  createOutfitsPointerValidateFn,
  createOutfitsValidateFn,
  outfitSlotsAreBetween0and9inclusiveValidateFn,
  outfitSlotsAreNotRepeatedValidateFn,
  outfitsNumberOfNamesForExtraSlotsIsCorrectValidateFn
} from '../../../src/validations/outfits'
import { buildDeployment } from '../../setup/deployments'
import { buildComponents, buildExternalCalls } from '../../setup/mock'
import { VALID_OUTFITS_METADATA } from '../../setup/outfits'
import type { ValidationResponse } from '../../../src/types'

type TypedEntity<T> = Entity & {
  metadata: T
}

const OWNER_ADDRESS = '0x12e7f74e73e951c61edd80910e46c3fece512345'
const SAMPLE_ENTITY_ID = 'bafybeihz4c4cf4icnlh6yjtt7fooaeih3dkv2mz6umod7dybenzmsxkzvq'
const BASE_OUTFIT: Outfit = {
  bodyShape: 'urn:decentraland:off-chain:base-avatars:BaseMale',
  eyes: { color: { r: 0.23046875, g: 0.625, b: 0.3125 } },
  hair: { color: { r: 0.35546875, g: 0.19140625, b: 0.05859375 } },
  skin: { color: { r: 0.94921875, g: 0.76171875, b: 0.6484375 } },
  wearables: ['urn:decentraland:off-chain:base-avatars:tall_front_01']
}

const outfitWithSlot = (slot: number): Outfits['outfits'][0] => ({ slot, outfit: BASE_OUTFIT })

const buildOutfitsEntity = (pointer: string, metadata: Outfits): TypedEntity<Outfits> => ({
  version: '3',
  type: EntityType.OUTFITS,
  pointers: [pointer],
  timestamp: Date.now(),
  content: [],
  id: SAMPLE_ENTITY_ID,
  metadata
})

describe('when validating the outfits pointer', () => {
  const runPointerValidation = async (pointer: string, ownerAddress: string): Promise<ValidationResponse> => {
    const entity = buildOutfitsEntity(pointer, VALID_OUTFITS_METADATA)
    const deployment = buildDeployment({ entity })
    const externalCalls = buildExternalCalls({
      ownerAddress: () => ownerAddress
    })
    return createOutfitsPointerValidateFn({ externalCalls })(deployment)
  }

  describe('and the pointer follows the <address>:outfits format', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      result = await runPointerValidation(`${OWNER_ADDRESS}:outfits`, OWNER_ADDRESS)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the pointer has more than two parts', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      result = await runPointerValidation(`${OWNER_ADDRESS}:outfits:more`, OWNER_ADDRESS)
    })

    it('should return a format error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('The pointer is not valid. It should be in the format: <address>:outfits')
    })
  })

  describe('and the pointer has fewer than two parts', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      result = await runPointerValidation(OWNER_ADDRESS, OWNER_ADDRESS)
    })

    it('should return a format error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('The pointer is not valid. It should be in the format: <address>:outfits')
    })
  })

  describe('and the pointer second part is not "outfits"', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      result = await runPointerValidation(`${OWNER_ADDRESS}:NO-outfit`, OWNER_ADDRESS)
    })

    it('should return a format error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('The pointer is not valid. It should be in the format: <address>:outfits')
    })
  })

  describe('and the pointer address part is not a valid ethereum address', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const invalidAddress = 'not-valid-ethAddress'
      result = await runPointerValidation(`${invalidAddress}:outfits`, invalidAddress)
    })

    it('should return an invalid address error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('The address of the given pointer is not a valid ethereum address.')
    })
  })

  describe('and the pointer address does not match the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      result = await runPointerValidation(`${OWNER_ADDRESS}:outfits`, 'anotherAddress')
    })

    it('should return an ownership mismatch error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual(
        'You can only alter your own outfits. The address of the pointer and the signer address are different (pointer:0x12e7f74e73e951c61edd80910e46c3fece512345:outfits signer: anotheraddress).'
      )
    })
  })
})

describe('when validating outfit slot uniqueness', () => {
  describe('and all slots are unique', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(2)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      result = await outfitSlotsAreNotRepeatedValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a slot is repeated', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(2), outfitWithSlot(1)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      result = await outfitSlotsAreNotRepeatedValidateFn(deployment)
    })

    it('should return a repeated slots error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('Outfits slots are repeated')
    })
  })
})

describe('when validating that outfit slots are between 0 and 9 inclusive', () => {
  describe('and all slots are inside the range', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(2)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      result = await outfitSlotsAreBetween0and9inclusiveValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a slot is outside the range', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(-1), outfitWithSlot(10)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      result = await outfitSlotsAreBetween0and9inclusiveValidateFn(deployment)
    })

    it('should return an out-of-range slot error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('Outfits slots are invalid, they must be between 0 and 9 inclusive')
    })
  })
})

describe('when validating the number of names for extra slots', () => {
  describe('and only core slots (0-4) are used without names', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(4)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      result = await outfitsNumberOfNamesForExtraSlotsIsCorrectValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and extra slots (5-9) are used with a matching number of names', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(4), outfitWithSlot(5), outfitWithSlot(6), outfitWithSlot(7)],
        namesForExtraSlots: ['name1', 'name2', 'name3']
      })
      const deployment = buildDeployment({ entity })
      result = await outfitsNumberOfNamesForExtraSlotsIsCorrectValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and extra slots are used but no names are provided', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(1), outfitWithSlot(4), outfitWithSlot(5), outfitWithSlot(6)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity })
      result = await outfitsNumberOfNamesForExtraSlotsIsCorrectValidateFn(deployment)
    })

    it('should return an error reporting the missing extra-slot names', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.[0]).toEqual('A name must be provided if extra slots are used, but none were provided.')
    })
  })
})

describe('when validating outfits through the full chain', () => {
  let validateFn: ReturnType<typeof createOutfitsValidateFn>

  beforeEach(() => {
    const components = buildComponents({
      externalCalls: buildExternalCalls({
        ownerAddress: () => OWNER_ADDRESS
      })
    })
    validateFn = createOutfitsValidateFn(components)
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and an outfit has a slot number outside 0-9', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(0), outfitWithSlot(10)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity, auditInfo: { authChain: [] } })
      result = await validateFn(deployment)
    })

    it('should reject the deployment and report an out-of-range slot', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Outfits slots are invalid, they must be between 0 and 9 inclusive')
    })
  })

  describe('and all outfit slots are within 0-9', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildOutfitsEntity(`${OWNER_ADDRESS}:outfits`, {
        outfits: [outfitWithSlot(0), outfitWithSlot(4)],
        namesForExtraSlots: []
      })
      const deployment = buildDeployment({ entity, auditInfo: { authChain: [] } })
      result = await validateFn(deployment)
    })

    it('should accept the deployment', () => {
      expect(result.ok).toBe(true)
    })
  })
})
