import { EntityType } from '@dcl/schemas'
import { createItemsOwnershipWith, createNamesOwnershipWith } from './mock'
import {
  createItemOwnershipValidateFn,
  createNamesOwnershipValidateFn,
  createPointerValidateFn
} from '../../../src/validations/access/common/profile'
import { ADR_74_TIMESTAMP, ADR_75_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment, buildProfileDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import { buildExternalCalls } from '../../setup/mock'
import { VALID_PROFILE_METADATA, validProfileMetadataWithEmotes } from '../../setup/profiles'
import type { ValidationResponse } from '../../../src/types'

const SIGNER_ADDRESS = '0x862f109696d7121438642a78b3caa38f476db08b'
const POST_ADR_74_TIMESTAMP = ADR_74_TIMESTAMP + 1
const POST_ADR_75_TIMESTAMP = ADR_75_TIMESTAMP + 1
const PRE_ADR_75_TIMESTAMP = ADR_75_TIMESTAMP - 1
const UNOWNED_WEARABLE_URN =
  'urn:decentraland:matic:collections-v2:0xf6f601efee04e74cecac02c8c5bdc8cc0fc1c721:0:1295628'

describe('when validating profile item ownership', () => {
  describe('and the profile only references wearables owned by the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: VALID_PROFILE_METADATA,
        timestamp: POST_ADR_75_TIMESTAMP,
        pointers: [SIGNER_ADDRESS]
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => SIGNER_ADDRESS })
      const itemsOwnership = createItemsOwnershipWith(
        SIGNER_ADDRESS,
        VALID_PROFILE_METADATA.avatars[0].avatar.wearables
      )
      const validateFn = createItemOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the profile references a wearable not owned by the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: VALID_PROFILE_METADATA,
        timestamp: POST_ADR_75_TIMESTAMP,
        pointers: [SIGNER_ADDRESS]
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => SIGNER_ADDRESS })
      const ownedWearables = VALID_PROFILE_METADATA.avatars[0].avatar.wearables.filter(
        (wearable) => wearable !== UNOWNED_WEARABLE_URN
      )
      const itemsOwnership = createItemsOwnershipWith(SIGNER_ADDRESS, ownedWearables)
      const validateFn = createItemOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    it('should return an error listing the unowned wearable', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `The following items (${UNOWNED_WEARABLE_URN}) are not owned by the address ${SIGNER_ADDRESS}.`
      )
    })
  })

  describe('and the profile only references emotes owned by the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const emoteUrn = 'urn:decentraland:matic:collections-v2:0xa7f6eba61566fd4b3012569ef30f0200ec138aa5:0'
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: validProfileMetadataWithEmotes([{ slot: 0, urn: emoteUrn }]),
        timestamp: POST_ADR_74_TIMESTAMP,
        pointers: [SIGNER_ADDRESS]
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => SIGNER_ADDRESS })
      const itemsOwnership = createItemsOwnershipWith(SIGNER_ADDRESS, [emoteUrn])
      const validateFn = createItemOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the profile references an emote not owned by the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const ownedEmoteUrn = 'urn:decentraland:matic:collections-v2:0xa7f6eba61566fd4b3012569ef30f0200ec138aa5:0'
      const notOwnedEmoteUrn = 'urn:decentraland:matic:collections-v2:0xa7f6eba61566fd4b3012569ef30f0200ec138aa5:1'
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: validProfileMetadataWithEmotes([
          { slot: 0, urn: ownedEmoteUrn },
          { slot: 0, urn: notOwnedEmoteUrn }
        ]),
        timestamp: POST_ADR_74_TIMESTAMP,
        pointers: [SIGNER_ADDRESS]
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => SIGNER_ADDRESS })
      const itemsOwnership = createItemsOwnershipWith(SIGNER_ADDRESS, [ownedEmoteUrn])
      const validateFn = createItemOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    it('should return an error listing the unowned emote', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `The following items (${'urn:decentraland:matic:collections-v2:0xa7f6eba61566fd4b3012569ef30f0200ec138aa5:1'}) are not owned by the address ${SIGNER_ADDRESS}.`
      )
    })
  })

  describe('and the profile references a malformed dcl:// wearable URN', () => {
    let result: ValidationResponse
    const malformedUrn = 'dcl://collections/%'

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: validProfileMetadataWithEmotes([], [malformedUrn]),
        timestamp: POST_ADR_75_TIMESTAMP,
        pointers: [SIGNER_ADDRESS]
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => SIGNER_ADDRESS })
      const itemsOwnership = createItemsOwnershipWith(SIGNER_ADDRESS, [])
      const validateFn = createItemOwnershipValidateFn({ externalCalls }, itemsOwnership)
      result = await validateFn(deployment)
    })

    it('should complete validation without throwing and skip the malformed urn', () => {
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating profile names ownership', () => {
  describe('and the profile claims a name not owned by the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: VALID_PROFILE_METADATA,
        timestamp: POST_ADR_75_TIMESTAMP,
        pointers: [SIGNER_ADDRESS]
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => SIGNER_ADDRESS })
      const namesOwnership = createNamesOwnershipWith(SIGNER_ADDRESS, [])
      const validateFn = createNamesOwnershipValidateFn({ externalCalls }, namesOwnership)
      result = await validateFn(deployment)
    })

    it('should return an error listing the unowned name', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`The following names (Some Name) are not owned by the address ${SIGNER_ADDRESS}.`)
    })
  })

  describe('and the deployment timestamp is at or after ADR-75', () => {
    let namesOwnershipSpy: jest.SpyInstance

    beforeEach(async () => {
      const someValidAddress = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f'
      const deployment = buildProfileDeployment(['Default10'])
      deployment.entity.timestamp = ADR_75_TIMESTAMP
      deployment.entity.metadata = VALID_PROFILE_METADATA
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => someValidAddress
      })
      const namesOwnership = createNamesOwnershipWith(someValidAddress, [])
      namesOwnershipSpy = jest.spyOn(namesOwnership, 'ownsNamesAtTimestamp')
      const validateFn = createNamesOwnershipValidateFn({ externalCalls }, namesOwnership)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the names ownership service', () => {
      expect(namesOwnershipSpy).toHaveBeenCalled()
    })
  })

  describe('and the deployment timestamp is before ADR-75', () => {
    let namesOwnershipSpy: jest.SpyInstance

    beforeEach(async () => {
      const someValidAddress = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f'
      const deployment = buildProfileDeployment(['Default10'])
      deployment.entity.timestamp = PRE_ADR_75_TIMESTAMP
      deployment.entity.metadata = VALID_PROFILE_METADATA
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => someValidAddress
      })
      const namesOwnership = createNamesOwnershipWith(someValidAddress, [])
      namesOwnershipSpy = jest.spyOn(namesOwnership, 'ownsNamesAtTimestamp')
      const validateFn = createNamesOwnershipValidateFn({ externalCalls }, namesOwnership)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should not query the names ownership service', () => {
      expect(namesOwnershipSpy).not.toHaveBeenCalled()
    })
  })

  describe('and all claimed names are owned by the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const someValidAddress = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f'
      const deployment = buildProfileDeployment(['Default10'])
      deployment.entity.timestamp = PRE_ADR_75_TIMESTAMP
      deployment.entity.metadata = VALID_PROFILE_METADATA
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => someValidAddress
      })
      const namesOwnership = createNamesOwnershipWith(
        someValidAddress,
        VALID_PROFILE_METADATA.avatars.map((a) => a.name)
      )
      const validateFn = createNamesOwnershipValidateFn({ externalCalls }, namesOwnership)
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating the profile pointer', () => {
  describe('and the pointer matches the signer address', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const someAddress = '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c'
      const deployment = buildProfileDeployment([someAddress])
      const externalCalls = buildExternalCalls({ ownerAddress: () => someAddress })
      const validateFn = createPointerValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a Decentraland address deploys a default profile', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const someValidAddress = '0x71c7656ec7ab88b098defb751b7401b5f6d8976f'
      const deployment = buildProfileDeployment(['Default10'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => someValidAddress
      })
      const validateFn = createPointerValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a non-Decentraland address deploys a default profile', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const deployment = buildProfileDeployment(['Default10'])
      const externalCalls = buildExternalCalls()
      const validateFn = createPointerValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error indicating only Decentraland can modify default profiles', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Only Decentraland can add or modify default profiles')
    })
  })

  describe('and the deployment has more than one pointer', () => {
    let addresses: string[]
    let result: ValidationResponse

    beforeEach(async () => {
      addresses = ['some-address-1', 'some-address=2']
      const deployment = buildProfileDeployment(addresses)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some-address' })
      const validateFn = createPointerValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error stating only one pointer is allowed', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Only one pointer is allowed when you create a Profile. Received: ${addresses}`)
    })
  })

  describe('and the pointer does not match the signer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const pointer = '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c'
      const address = '0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4a'
      const deployment = buildProfileDeployment([pointer])
      const externalCalls = buildExternalCalls({ ownerAddress: () => address })
      const validateFn = createPointerValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error stating profile and signer addresses differ', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `You can only alter your own profile. The pointer address and the signer address are different (pointer:0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4c signer: 0x5a0b54d5dc17e0aadc383d2db43b0a0d3e029c4a).`
      )
    })
  })

  describe('and the pointer is not a valid ethereum address', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const deployment = buildProfileDeployment(['someNonEthAddress'])
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'anotherNonEthAddress' })
      const validateFn = createPointerValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error reporting an invalid ethereum address', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('The given pointer is not a valid ethereum address.')
    })
  })
})
