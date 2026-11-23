import { EntityType } from '@dcl/schemas'
import type { Entity, ThirdPartyProps } from '@dcl/schemas'
import { thirdPartyEmoteMerkleProofContentValidateFn } from '../../../../src/validations/items/emotes'
import { thirdPartyWearableMerkleProofContentValidateFn } from '../../../../src/validations/items/wearables'
import { THIRD_PARTY_FULL_COMMIT_TIMESTAMP } from '../../../../src/validations/timestamps'
import { buildDeployment } from '../../../setup/deployments'
import { VALID_THIRD_PARTY_EMOTE_METADATA_WITH_MERKLE_ROOT } from '../../../setup/emotes'
import { buildEntity } from '../../../setup/entity'
import { VALID_THIRD_PARTY_WEARABLE } from '../../../setup/wearable'
import type { DeploymentToValidate, ValidationResponse } from '../../../../src/types'

type ThirdPartyMetadata = ThirdPartyProps & { id: string; content: Record<string, string> } & Record<string, unknown>

const itemCases = [
  {
    itemLabel: 'wearable',
    type: EntityType.WEARABLE,
    metadata: VALID_THIRD_PARTY_WEARABLE.entity as unknown as ThirdPartyMetadata,
    validateFn: thirdPartyWearableMerkleProofContentValidateFn
  },
  {
    itemLabel: 'emote',
    type: EntityType.EMOTE,
    metadata: VALID_THIRD_PARTY_EMOTE_METADATA_WITH_MERKLE_ROOT.entity as unknown as ThirdPartyMetadata,
    validateFn: thirdPartyEmoteMerkleProofContentValidateFn
  }
]

function buildThirdPartyEntity(type: EntityType, metadata: ThirdPartyMetadata, timestamp: number): Entity {
  return buildEntity({
    type,
    pointers: [metadata.id],
    metadata,
    content: Object.keys(metadata.content).map((file) => ({ file, hash: metadata.content[file] })),
    timestamp
  })
}

function withHashingKeys(metadata: ThirdPartyMetadata, hashingKeys: string[]): ThirdPartyMetadata {
  return { ...metadata, merkleProof: { ...metadata.merkleProof, hashingKeys } }
}

describe.each(itemCases)(
  'when validating that a third-party $itemLabel merkle proof commits every metadata field',
  ({ itemLabel, type, metadata, validateFn }) => {
    let deployment: DeploymentToValidate
    let result: ValidationResponse

    describe('and the proof commits every metadata field', () => {
      beforeEach(async () => {
        deployment = buildDeployment({
          entity: buildThirdPartyEntity(type, metadata, THIRD_PARTY_FULL_COMMIT_TIMESTAMP)
        })
        result = await validateFn(deployment)
      })

      it('should accept the item', () => {
        expect(result.ok).toBe(true)
      })
    })

    describe('and the metadata has a field the proof does not commit', () => {
      let metadataWithExtraField: ThirdPartyMetadata

      beforeEach(() => {
        metadataWithExtraField = { ...metadata, extraField: 'some value' }
      })

      describe('and the entity was deployed before the full-commit cutoff', () => {
        beforeEach(async () => {
          deployment = buildDeployment({
            entity: buildThirdPartyEntity(type, metadataWithExtraField, THIRD_PARTY_FULL_COMMIT_TIMESTAMP - 1)
          })
          result = await validateFn(deployment)
        })

        it('should accept the item', () => {
          expect(result.ok).toBe(true)
        })
      })

      describe.each([
        ['at', 0],
        ['after', 1]
      ])('and the entity was deployed %s the full-commit cutoff', (_, offset) => {
        beforeEach(async () => {
          deployment = buildDeployment({
            entity: buildThirdPartyEntity(type, metadataWithExtraField, THIRD_PARTY_FULL_COMMIT_TIMESTAMP + offset)
          })
          result = await validateFn(deployment)
        })

        it('should reject the item naming the uncommitted field', () => {
          expect(result).toEqual({
            ok: false,
            errors: [
              `The third-party ${itemLabel} merkle proof must commit every metadata field; 'extraField' is not in hashingKeys`
            ]
          })
        })
      })
    })

    describe('and the proof lists a hashing key more than once', () => {
      let metadataWithDuplicateKey: ThirdPartyMetadata

      beforeEach(() => {
        metadataWithDuplicateKey = withHashingKeys(metadata, [...metadata.merkleProof.hashingKeys, 'name'])
      })

      describe('and the entity was deployed before the full-commit cutoff', () => {
        beforeEach(async () => {
          deployment = buildDeployment({
            entity: buildThirdPartyEntity(type, metadataWithDuplicateKey, THIRD_PARTY_FULL_COMMIT_TIMESTAMP - 1)
          })
          result = await validateFn(deployment)
        })

        it('should accept the item', () => {
          expect(result.ok).toBe(true)
        })
      })

      describe('and the entity was deployed at the full-commit cutoff', () => {
        beforeEach(async () => {
          deployment = buildDeployment({
            entity: buildThirdPartyEntity(type, metadataWithDuplicateKey, THIRD_PARTY_FULL_COMMIT_TIMESTAMP)
          })
          result = await validateFn(deployment)
        })

        it('should reject the item naming the repeated hashing key', () => {
          expect(result).toEqual({
            ok: false,
            errors: [`The third-party ${itemLabel} merkle proof lists 'name' more than once in hashingKeys`]
          })
        })
      })
    })

    describe('and the proof lists the merkle proof itself as a hashing key', () => {
      beforeEach(async () => {
        deployment = buildDeployment({
          entity: buildThirdPartyEntity(
            type,
            withHashingKeys(metadata, [...metadata.merkleProof.hashingKeys, 'merkleProof']),
            THIRD_PARTY_FULL_COMMIT_TIMESTAMP
          )
        })
        result = await validateFn(deployment)
      })

      it('should reject the item naming the merkle proof key', () => {
        expect(result).toEqual({
          ok: false,
          errors: [`The third-party ${itemLabel} merkle proof commits 'merkleProof', which is not a metadata field`]
        })
      })
    })
  }
)
