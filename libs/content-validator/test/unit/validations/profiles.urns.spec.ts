import { emoteUrnsValidateFn, isOldEmote, wearableUrnsValidateFn } from '../../../src/validations/profile'
import { ADR_244_TIMESTAMP, ADR_74_TIMESTAMP, ADR_75_TIMESTAMP } from '../../../src/validations/timestamps'
import { validateAfterADR74, validateAfterADR75 } from '../../../src/validations/validations'
import { buildDeployment } from '../../setup/deployments'
import { buildProfileEntity } from '../../setup/entity'
import { VALID_PROFILE_METADATA, validProfileMetadataWithEmotes } from '../../setup/profiles'
import type { DeploymentToValidate, ValidateFn, ValidationResponse } from '../../../src/types'

jest.mock('../../../src/validations/validations', () => ({
  ...jest.requireActual('../../../src/validations/validations'),
  validateAfterADR75: jest.fn((validateFn: ValidateFn) => validateFn),
  validateAfterADR74: jest.fn((validateFn: ValidateFn) => validateFn)
}))

const mockValidateAfterADR75 = validateAfterADR75 as jest.MockedFunction<typeof validateAfterADR75>
const mockValidateAfterADR74 = validateAfterADR74 as jest.MockedFunction<typeof validateAfterADR74>

describe('when checking if a string is an old emote', () => {
  describe('and the input is a short lowercase alpha string', () => {
    it('should return true', () => {
      expect(isOldEmote('dance')).toBe(true)
      expect(isOldEmote('wave')).toBe(true)
      expect(isOldEmote('raisehand')).toBe(true)
    })
  })

  describe('and the input is a short mixed-case alpha string', () => {
    it('should return true for backward compatibility', () => {
      expect(isOldEmote('Dance')).toBe(true)
      expect(isOldEmote('raiseHand')).toBe(true)
    })
  })

  describe('and the input is longer than 20 characters', () => {
    it('should return false', () => {
      expect(isOldEmote('aVeryLongEmoteNameThatExceedsTwenty')).toBe(false)
    })
  })

  describe('and the input contains numbers or special characters', () => {
    it('should return false', () => {
      expect(isOldEmote('dance123')).toBe(false)
      expect(isOldEmote('urn:decentraland:matic:collections-v2:0x123:0')).toBe(false)
    })
  })
})

describe('when validating wearable URNs', () => {
  let deployment: DeploymentToValidate

  beforeEach(() => {
    jest.clearAllMocks()

    deployment = buildDeployment({
      entity: buildProfileEntity({
        timestamp: ADR_75_TIMESTAMP + 1000,
        metadata: VALID_PROFILE_METADATA
      })
    })
  })

  it('should call validateAfterADR75', async () => {
    await wearableUrnsValidateFn(deployment)
    expect(mockValidateAfterADR75).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('and all wearables are valid URNs', () => {
    it('should return ok', async () => {
      const result: ValidationResponse = await wearableUrnsValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and wearables include old emotes', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.wearables = [
        'dance',
        'wave',
        'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0'
      ]
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await wearableUrnsValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and a wearable has an invalid URN', () => {
    let invalidPointer: string

    beforeEach(() => {
      invalidPointer = 'urn:decentraland:invalid'
      deployment.entity.metadata.avatars[0].avatar.wearables = [invalidPointer]
    })

    it('should return an error with the invalid pointer', async () => {
      const result: ValidationResponse = await wearableUrnsValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Each profile wearable pointer should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${invalidPointer})`
      )
    })
  })

  describe('and if the deployment is after the ADR 244 timestamp', () => {
    beforeEach(() => {
      deployment.entity.timestamp = ADR_244_TIMESTAMP + 1000
    })

    describe('and a wearable is a blockchain collection v2 asset instead of an item', () => {
      let assetPointer: string

      beforeEach(() => {
        assetPointer = 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0'
        deployment.entity.metadata.avatars[0].avatar.wearables = [assetPointer]
      })

      it('should return an error indicating that the asset should be item', async () => {
        const result: ValidationResponse = await wearableUrnsValidateFn(deployment)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          `Wearable pointer ${assetPointer} should be an item, not an asset. The URN must include the tokenId.`
        )
      })
    })

    describe('and a wearable is a blockchain collection v1 asset instead of an item', () => {
      let assetPointer: string

      beforeEach(() => {
        assetPointer = 'urn:decentraland:ethereum:collections-v1:0x09305998a531fade369ebe30adf868c96a34e813:1'
        deployment.entity.metadata.avatars[0].avatar.wearables = [assetPointer]
      })

      it('should return an error indicating that the asset should be item', async () => {
        const result: ValidationResponse = await wearableUrnsValidateFn(deployment)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          `Wearable pointer ${assetPointer} should be an item, not an asset. The URN must include the tokenId.`
        )
      })
    })

    describe('and wearables are items with tokenId', () => {
      beforeEach(() => {
        deployment.entity.metadata.avatars[0].avatar.wearables = [
          'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0:123'
        ]
      })

      it('should return ok', async () => {
        const result: ValidationResponse = await wearableUrnsValidateFn(deployment)
        expect(result.ok).toBe(true)
      })
    })
  })
})

describe('when validating emote URNs', () => {
  let deployment: DeploymentToValidate

  beforeEach(() => {
    jest.clearAllMocks()

    deployment = buildDeployment({
      entity: buildProfileEntity({
        timestamp: ADR_74_TIMESTAMP + 1000,
        metadata: VALID_PROFILE_METADATA
      })
    })
  })

  it('should call validateAfterADR74', async () => {
    await emoteUrnsValidateFn(deployment)
    expect(mockValidateAfterADR74).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('and all emotes are valid URNs with valid slots', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.emotes = [
        { slot: 0, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0' },
        { slot: 1, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:1' }
      ]
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and emotes include old emotes', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.emotes = [
        { slot: 0, urn: 'dance' },
        { slot: 1, urn: 'wave' }
      ]
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and an emote has an invalid URN', () => {
    let invalidUrn: string

    beforeEach(() => {
      invalidUrn = 'urn:decentraland:invalid'
      deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_74_TIMESTAMP + 1000,
          metadata: validProfileMetadataWithEmotes([{ slot: 0, urn: invalidUrn }], [])
        })
      })
    })

    it('should return an error with the invalid URN', async () => {
      const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Each profile emote pointer should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{name}). Invalid pointer: (${invalidUrn})`
      )
    })
  })

  describe('and if the deployment is after the ADR 244 timestamp', () => {
    beforeEach(() => {
      deployment.entity.timestamp = ADR_244_TIMESTAMP + 1000
    })

    describe('and an emote is a blockchain collection v2 asset instead of an item', () => {
      let assetUrn: string

      beforeEach(() => {
        assetUrn = 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0'
        deployment.entity.metadata.avatars[0].avatar.emotes = [{ slot: 0, urn: assetUrn }]
      })

      it('should return an error indicating asset should be item', async () => {
        const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          `Emote pointer ${assetUrn} should be an item, not an asset. The URN must include the tokenId.`
        )
      })
    })

    describe('and an emote is a blockchain collection v1 asset instead of an item', () => {
      let assetUrn: string

      beforeEach(() => {
        assetUrn = 'urn:decentraland:ethereum:collections-v1:0x09305998a531fade369ebe30adf868c96a34e813:1'
        deployment.entity.metadata.avatars[0].avatar.emotes = [{ slot: 0, urn: assetUrn }]
      })

      it('should return an error indicating that the asset should be item', async () => {
        const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          `Emote pointer ${assetUrn} should be an item, not an asset. The URN must include the tokenId.`
        )
      })
    })

    describe('and emotes are items with tokenId', () => {
      beforeEach(() => {
        deployment.entity.metadata.avatars[0].avatar.emotes = [
          { slot: 0, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0:123' }
        ]
      })

      it('should return ok', async () => {
        const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
        expect(result.ok).toBe(true)
      })
    })
  })

  describe('and an emote has an invalid negative slot', () => {
    let invalidSlot: number

    beforeEach(() => {
      invalidSlot = -1
      deployment.entity.metadata.avatars[0].avatar.emotes = [
        { slot: invalidSlot, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0' }
      ]
    })

    it('should return an error about invalid slot range', async () => {
      const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `The slot ${invalidSlot} of the emote urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0 must be a number between 0 and 9 (inclusive).`
      )
    })
  })

  describe('and an emote has an invalid positive slot greater than 9', () => {
    let invalidSlot: number

    beforeEach(() => {
      invalidSlot = 10
      deployment.entity.metadata.avatars[0].avatar.emotes = [
        { slot: invalidSlot, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0' }
      ]
    })

    it('should return an error about invalid slot range', async () => {
      const result: ValidationResponse = await emoteUrnsValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `The slot ${invalidSlot} of the emote urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0 must be a number between 0 and 9 (inclusive).`
      )
    })
  })
})
