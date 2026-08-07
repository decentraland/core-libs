import { BodyShape, EmoteCategory } from '@dcl/schemas'
import type { Emote, ThirdPartyProps } from '@dcl/schemas'
import { buildEmoteValidateFn, buildOnChainAccessCheckerComponents } from './mock'
import { emoteValidateFn } from '../../../src/validations/items/emotes'
import { ADR_74_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildAuditInfo, buildThirdPartyEmoteDeployment } from '../../setup/deployments'
import { buildEmoteEntity } from '../../setup/entity'
import { VALID_THIRD_PARTY_WEARABLE } from '../../setup/wearable'
import type { DeploymentToValidate, ValidationResponse } from '../../../src/types'

describe('when an approved third-party wearable leaf is reused to deploy an emote', () => {
  const approvedWearableMetadata = VALID_THIRD_PARTY_WEARABLE.entity

  const forgedEmoteMetadata = {
    ...approvedWearableMetadata,
    emoteDataADR74: {
      category: EmoteCategory.FUN,
      tags: ['tag1'],
      representations: [{ bodyShapes: [BodyShape.FEMALE], mainFile: 'file1', contents: ['file1', 'file2'] }],
      loop: true
    }
  } as unknown as Emote & ThirdPartyProps

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and it is checked only by the shared on-chain third-party access check', () => {
    let response: ValidationResponse
    let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

    beforeEach(async () => {
      components = buildOnChainAccessCheckerComponents()
      components.L2.checker.validateThirdParty = jest.fn(() => Promise.resolve(true))
      const deployment = buildThirdPartyEmoteDeployment(forgedEmoteMetadata.id, forgedEmoteMetadata)
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should verify the reused wearable leaf against the approved root (access check alone cannot tell it is a wearable leaf)', () => {
      expect(response.ok).toBe(true)
    })
  })

  describe('and it is checked by the emote item validation', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEmoteEntity({
        pointers: [forgedEmoteMetadata.id],
        metadata: forgedEmoteMetadata,
        content: [
          { file: 'file1', hash: 'QmAttackerControlledHashXXXXXXXXXXXXXXXXXXXXXX1' },
          { file: 'file2', hash: 'QmAttackerControlledHashXXXXXXXXXXXXXXXXXXXXXX2' }
        ],
        timestamp: ADR_74_TIMESTAMP + 1
      })
      const deployment: DeploymentToValidate = { entity, files: new Map(), auditInfo: buildAuditInfo() }
      result = await emoteValidateFn(deployment)
    })

    it('should reject the emote because the reused proof does not commit emoteDataADR74', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`The third-party emote merkle proof must commit the 'emoteDataADR74' field`)
    })
  })

  describe('and emoteDataADR74 is added to the hashing keys to genuinely commit it (negative control)', () => {
    let response: ValidationResponse
    let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

    beforeEach(async () => {
      components = buildOnChainAccessCheckerComponents()
      components.L2.checker.validateThirdParty = jest.fn(() => Promise.resolve(true))

      const properlyCommittedEmoteMetadata = {
        ...forgedEmoteMetadata,
        merkleProof: {
          ...forgedEmoteMetadata.merkleProof,
          hashingKeys: [...forgedEmoteMetadata.merkleProof.hashingKeys, 'emoteDataADR74']
        }
      } as unknown as Emote & ThirdPartyProps

      const deployment = buildThirdPartyEmoteDeployment(
        properlyCommittedEmoteMetadata.id,
        properlyCommittedEmoteMetadata
      )
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should reject before the on-chain root check because committing emoteDataADR74 changes the recomputed leaf hash', () => {
      expect(response.ok).toBe(false)
      expect(components.L2.checker.validateThirdParty).not.toHaveBeenCalled()
    })
  })
})
