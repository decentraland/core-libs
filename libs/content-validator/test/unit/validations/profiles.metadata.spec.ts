import {
  profileMustHaveEmotesValidateFn,
  profileMustNotHaveSnapshotsValidateFn,
  profileSlotsAreNotRepeatedValidateFn,
  profileWearablesNotRepeatedValidateFn
} from '../../../src/validations/profile'
import { ADR_232_TIMESTAMP, ADR_290_REJECTED_TIMESTAMP, ADR_74_TIMESTAMP } from '../../../src/validations/timestamps'
import {
  validateAfterADR232,
  validateAfterADR290RejectedTimestamp,
  validateAfterADR74
} from '../../../src/validations/validations'
import { buildDeployment } from '../../setup/deployments'
import { buildProfileEntity } from '../../setup/entity'
import { VALID_PROFILE_METADATA, validProfileMetadataWithEmotes } from '../../setup/profiles'
import type { DeploymentToValidate, ValidateFn, ValidationResponse } from '../../../src/types'

jest.mock('../../../src/validations/validations', () => ({
  ...jest.requireActual('../../../src/validations/validations'),
  validateAfterADR74: jest.fn((validateFn: ValidateFn) => validateFn),
  validateAfterADR232: jest.fn((validateFn: ValidateFn) => validateFn),
  validateAfterADR290RejectedTimestamp: jest.fn((validateFn: ValidateFn) => validateFn)
}))

const mockValidateAfterADR74 = validateAfterADR74 as jest.MockedFunction<typeof validateAfterADR74>
const mockValidateAfterADR232 = validateAfterADR232 as jest.MockedFunction<typeof validateAfterADR232>
const mockValidateAfterADR290RejectedTimestamp = validateAfterADR290RejectedTimestamp as jest.MockedFunction<
  typeof validateAfterADR290RejectedTimestamp
>

describe('when validating that profile must have emotes', () => {
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
    await profileMustHaveEmotesValidateFn(deployment)
    expect(mockValidateAfterADR74).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('and the profile has emotes', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.emotes = [
        { slot: 0, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0' }
      ]
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await profileMustHaveEmotesValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and the profile does not have emotes', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.emotes = undefined
    })

    it('should return an error', async () => {
      const result: ValidationResponse = await profileMustHaveEmotesValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Profile must have emotes after ADR 74.')
    })
  })

  describe('and the profile has empty emotes array', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.emotes = []
    })

    it('should return ok since the array exists', async () => {
      const result: ValidationResponse = await profileMustHaveEmotesValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating that emote slots are not repeated', () => {
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

  describe('and all slots are unique', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.emotes = [
        { slot: 0, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0' },
        { slot: 1, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:1' },
        { slot: 2, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:2' }
      ]
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await profileSlotsAreNotRepeatedValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and an emote has a repeated slot', () => {
    beforeEach(() => {
      deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_74_TIMESTAMP + 1000,
          metadata: validProfileMetadataWithEmotes(
            [
              { slot: 0, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0' },
              { slot: 0, urn: 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:1' }
            ],
            []
          )
        })
      })
    })

    it('should return an error', async () => {
      const result: ValidationResponse = await profileSlotsAreNotRepeatedValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Emote slot 0 should not be repeated.')
    })
  })

  describe('and there are no emotes', () => {
    beforeEach(() => {
      deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_74_TIMESTAMP + 1000,
          metadata: VALID_PROFILE_METADATA
        })
      })
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await profileSlotsAreNotRepeatedValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating that wearables are not repeated', () => {
  let deployment: DeploymentToValidate

  beforeEach(() => {
    jest.clearAllMocks()

    deployment = buildDeployment({
      entity: buildProfileEntity({
        timestamp: ADR_232_TIMESTAMP + 1000,
        metadata: VALID_PROFILE_METADATA
      })
    })
  })

  it('should call validateAfterADR232', async () => {
    await profileWearablesNotRepeatedValidateFn(deployment)
    expect(mockValidateAfterADR232).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('and the avatar has unique wearables', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.wearables = [
        'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0',
        'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:1',
        'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:2'
      ]
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await profileWearablesNotRepeatedValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and the avatar has a repeated wearable', () => {
    let repeatedWearable: string

    beforeEach(() => {
      repeatedWearable = 'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0'
      deployment.entity.metadata.avatars[0].avatar.wearables = [
        repeatedWearable,
        'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:1',
        repeatedWearable
      ]
    })

    it('should return an error', async () => {
      const result: ValidationResponse = await profileWearablesNotRepeatedValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Wearables should not be repeated.')
    })
  })

  describe('and the avatar has no wearables', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.wearables = []
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await profileWearablesNotRepeatedValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating that profile must not have snapshots', () => {
  let deployment: DeploymentToValidate

  beforeEach(() => {
    jest.clearAllMocks()

    deployment = buildDeployment({
      entity: buildProfileEntity({
        timestamp: ADR_290_REJECTED_TIMESTAMP + 1000,
        metadata: VALID_PROFILE_METADATA
      })
    })
  })

  it('should call validateAfterADR290RejectedTimestamp', async () => {
    await profileMustNotHaveSnapshotsValidateFn(deployment)
    expect(mockValidateAfterADR290RejectedTimestamp).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('and the avatar has no snapshots', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.snapshots = undefined
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await profileMustNotHaveSnapshotsValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and the avatar has a snapshot', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.snapshots = {
        face256: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s',
        body: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      }
    })

    it('should return an error', async () => {
      const result: ValidationResponse = await profileMustNotHaveSnapshotsValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Avatars must not have snapshots.')
    })
  })
})
