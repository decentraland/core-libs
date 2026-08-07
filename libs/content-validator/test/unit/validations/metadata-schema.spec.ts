import { EntityType } from '@dcl/schemas'
import {
  metadataValidateFn,
  metadataVersionIsCorrectForTimestampValidateFn
} from '../../../src/validations/metadata-schema'
import { ADR_45_TIMESTAMP, ADR_74_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { VALID_STANDARD_EMOTE_METADATA, VALID_THIRD_PARTY_EMOTE_METADATA_WITH_MERKLE_ROOT } from '../../setup/emotes'
import { buildEntity } from '../../setup/entity'
import { VALID_OUTFITS_METADATA } from '../../setup/outfits'
import { VALID_PROFILE_METADATA } from '../../setup/profiles'
import { BASE_WEARABLE_METADATA, VALID_THIRD_PARTY_WEARABLE, VALID_WEARABLE_METADATA } from '../../setup/wearable'
import type { ValidationResponse } from '../../../src/types'

const POST_ADR_45_TIMESTAMP = ADR_45_TIMESTAMP + 1
const PRE_ADR_45_TIMESTAMP = ADR_45_TIMESTAMP - 1
const POST_ADR_74_TIMESTAMP = ADR_74_TIMESTAMP + 1
const invalidMetadata = {}

const describeMetadataType = (
  label: string,
  type: EntityType,
  validMetadata: unknown,
  timestamp: number = POST_ADR_45_TIMESTAMP,
  expectedExtraErrors: string[] = []
) => {
  describe(label, () => {
    describe('and the metadata is valid for the entity type', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const entity = buildEntity({ type, metadata: validMetadata, timestamp })
        const deployment = buildDeployment({ entity })
        result = await metadataValidateFn(deployment)
      })

      it('should return ok', () => {
        expect(result.ok).toBe(true)
      })
    })

    describe('and the metadata is invalid for the entity type', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const entity = buildEntity({ type, metadata: invalidMetadata, timestamp })
        const deployment = buildDeployment({ entity })
        result = await metadataValidateFn(deployment)
      })

      it('should return an error reporting the invalid metadata for the entity type', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(`The metadata for this entity type (${type}) is not valid.`)
        expectedExtraErrors.forEach((error) => expect(result.errors).toContain(error))
      })
    })
  })
}

describe('when validating entity metadata schema', () => {
  describeMetadataType('and the entity type is PROFILE', EntityType.PROFILE, VALID_PROFILE_METADATA)

  describeMetadataType(
    'and the entity type is SCENE',
    EntityType.SCENE,
    { main: 'bin/main.js', scene: { base: '0,0', parcels: ['0,0'] } },
    POST_ADR_45_TIMESTAMP,
    ["must have required property 'main'"]
  )

  describeMetadataType('and the entity type is WEARABLE', EntityType.WEARABLE, VALID_WEARABLE_METADATA)

  describeMetadataType(
    'and the entity type is WEARABLE (third party)',
    EntityType.WEARABLE,
    VALID_THIRD_PARTY_WEARABLE.entity
  )

  describeMetadataType(
    'and the entity type is EMOTE',
    EntityType.EMOTE,
    VALID_STANDARD_EMOTE_METADATA,
    POST_ADR_74_TIMESTAMP
  )

  describeMetadataType(
    'and the entity type is EMOTE (third party with merkle root)',
    EntityType.EMOTE,
    VALID_THIRD_PARTY_EMOTE_METADATA_WITH_MERKLE_ROOT.entity,
    POST_ADR_74_TIMESTAMP
  )

  describeMetadataType('and the entity type is OUTFITS', EntityType.OUTFITS, VALID_OUTFITS_METADATA)

  describe('and the entity timestamp is before ADR-45', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.PROFILE,
        metadata: invalidMetadata,
        timestamp: PRE_ADR_45_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await metadataValidateFn(deployment)
    })

    it('should skip metadata schema validation and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the wearable is a base wearable', () => {
    describe('and the base wearable metadata is valid', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const entity = buildEntity({ type: EntityType.WEARABLE, metadata: BASE_WEARABLE_METADATA })
        const deployment = buildDeployment({ entity })
        result = await metadataValidateFn(deployment)
      })

      it('should return ok', () => {
        expect(result.ok).toBe(true)
      })
    })

    describe('and the base wearable is missing required properties', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const entity = buildEntity({
          type: EntityType.WEARABLE,
          metadata: { ...BASE_WEARABLE_METADATA, i18n: undefined, id: undefined }
        })
        const deployment = buildDeployment({ entity })
        result = await metadataValidateFn(deployment)
      })

      it('should return errors listing the missing required properties', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(`The metadata for this entity type (${EntityType.WEARABLE}) is not valid.`)
        expect(result.errors).toContain("must have required property 'i18n'")
        expect(result.errors).toContain("must have required property 'id'")
      })
    })
  })

  describe('and the entity type is unknown', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: 'unknown-type' as EntityType,
        metadata: invalidMetadata,
        timestamp: POST_ADR_45_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await metadataValidateFn(deployment)
    })

    it('should return a validation failure for the unknown entity type without throwing', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('The entity type (unknown-type) is not a known entity type.')
    })
  })
})

describe('when validating emote metadata version', () => {
  describe('and the emote has a valid emoteDataADR74 field', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await metadataVersionIsCorrectForTimestampValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the emote is deployed exactly at the ADR-74 timestamp', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        timestamp: ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await metadataVersionIsCorrectForTimestampValidateFn(deployment)
    })

    it('should be governed by ADR-74 and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the emote is missing the emoteDataADR74 field', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const { emoteDataADR74: _emoteDataADR74, ...metadataWithoutEmoteData } = VALID_STANDARD_EMOTE_METADATA as Record<
        string,
        unknown
      > & { emoteDataADR74?: unknown }
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: metadataWithoutEmoteData,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await metadataVersionIsCorrectForTimestampValidateFn(deployment)
    })

    it('should return an error describing the missing version field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })

  describe('and the entity timestamp is before ADR-74', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: {},
        timestamp: ADR_74_TIMESTAMP - 1
      })
      const deployment = buildDeployment({ entity })
      result = await metadataVersionIsCorrectForTimestampValidateFn(deployment)
    })

    it('should skip validation and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})
