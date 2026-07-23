import { EntityType, WearableCategory } from '@dcl/schemas'
import {
  createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn,
  createThumbnailMaxSizeIsNotExceededValidateFn
} from '../../../../src/validations/items/items'
import {
  springBonesMetadataValidateFn,
  thirdPartyWearableMerkleProofContentValidateFn,
  wearableRepresentationContentValidateFn
} from '../../../../src/validations/items/wearables'
import { createSizeValidateFn } from '../../../../src/validations/size'
import { ADR_45_TIMESTAMP } from '../../../../src/validations/timestamps'
import { buildDeployment } from '../../../setup/deployments'
import { buildEntity, buildWearableEntity } from '../../../setup/entity'
import { buildComponents, buildExternalCalls, createImage } from '../../../setup/mock'
import { VALID_THIRD_PARTY_WEARABLE, VALID_WEARABLE_METADATA } from '../../../setup/wearable'
import type { ValidationResponse } from '../../../../src/types'

const withSize = (sizeInMB: number): Buffer => Buffer.alloc(sizeInMB * 1024 * 1024)
const timestamp = ADR_45_TIMESTAMP + 1

describe('when validating the wearable thumbnail size', () => {
  const fileName = 'thumbnail.png'
  const hash = 'thumbnail'
  let components: ReturnType<typeof buildComponents>
  let thumbnailMaxSizeValidateFn: ReturnType<typeof createThumbnailMaxSizeIsNotExceededValidateFn>

  beforeEach(() => {
    components = buildComponents()
    thumbnailMaxSizeValidateFn = createThumbnailMaxSizeIsNotExceededValidateFn(components)
  })

  describe('and the entity has no content mapping for the thumbnail file name', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const validThumbnailBuffer = await createImage(1024)
      const files = new Map([[hash, validThumbnailBuffer]])
      const entity = buildEntity({ type: EntityType.WEARABLE, metadata: VALID_WEARABLE_METADATA, timestamp })
      const deployment = buildDeployment({ entity, files })
      result = await thumbnailMaxSizeValidateFn(deployment)
    })

    it('should return an error reporting the missing hash for the thumbnail file', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't find hash for thumbnail file with name: ${fileName}`)
    })
  })

  describe('and the uploaded files do not include the thumbnail hash', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const validThumbnailBuffer = await createImage(1024)
      const content = [{ file: fileName, hash }]
      const files = new Map([['notSame' + hash, validThumbnailBuffer]])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await thumbnailMaxSizeValidateFn(deployment)
    })

    it('should return an error reporting the missing thumbnail file', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't find thumbnail file with hash: ${hash}`)
    })
  })

  describe('and the thumbnail buffer is not a parseable image', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [{ file: fileName, hash }]
      const files = new Map([[hash, Buffer.alloc(1)]])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await thumbnailMaxSizeValidateFn(deployment)
    })

    it('should return an error reporting an unparseable thumbnail', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't parse thumbnail, please check image format.`)
    })
  })

  describe('and the thumbnail dimensions exceed the allowed size', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const invalidThumbnailBuffer = await createImage(1025)
      const content = [{ file: fileName, hash }]
      const files = new Map([[hash, invalidThumbnailBuffer]])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await thumbnailMaxSizeValidateFn(deployment)
    })

    it('should return an error reporting the invalid dimensions', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Invalid thumbnail image size (width = 1025 / height = 1025)`)
    })
  })

  describe('and the thumbnail format is not PNG', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const jpgImage = await createImage(1024, 'jpg')
      const content = [{ file: fileName, hash }]
      const files = new Map([[hash, jpgImage]])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await thumbnailMaxSizeValidateFn(deployment)
    })

    it('should return an error requiring PNG format', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Invalid or unknown image format. Only 'PNG' format is accepted.`)
    })
  })

  describe('and the thumbnail size and format are valid', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const validThumbnailBuffer = await createImage(1024)
      const content = [{ file: fileName, hash }]
      const files = new Map([[hash, validThumbnailBuffer]])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await thumbnailMaxSizeValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the thumbnail file was already uploaded in a previous deployment', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [{ file: fileName, hash }]
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({
        isContentStoredAlready: async () => new Map([[hash, true]])
      })
      const validateFn = createThumbnailMaxSizeIsNotExceededValidateFn(buildComponents({ externalCalls }))
      result = await validateFn(deployment)
    })

    it('should skip thumbnail validation and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the thumbnail file size exceeds 1 MB', () => {
    // Validation reads `Buffer.byteLength` directly, not the decoded image, so
    // we use a fixed-size opaque buffer to keep this test deterministic across
    // platforms (sharp's PNG encoder produces different sizes on macOS vs Linux).
    const oversizedThumbnailBytes = 1.5 * 1024 * 1024
    let result: ValidationResponse

    beforeEach(async () => {
      const oversizedThumbnailBuffer = Buffer.alloc(oversizedThumbnailBytes)
      const content = [{ file: fileName, hash }]
      const files = new Map([[hash, oversizedThumbnailBuffer]])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the oversized thumbnail', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `The thumbnail is too big. The maximum allowed size for thumbnail model files is 1 MB. You can upload up to 1048576 bytes but you tried to upload ${oversizedThumbnailBytes}.`
      )
    })
  })
})

describe('when validating the wearable deployment size', () => {
  let components: ReturnType<typeof buildComponents>

  beforeEach(() => {
    components = buildComponents()
  })

  describe('and the model files exceed the non-skin size limit', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'A', hash: 'A' },
        { file: 'C', hash: 'C' },
        { file: 'thumbnail.png', hash: 'thumbnail' }
      ]
      const files = new Map([
        ['A', withSize(1)],
        ['C', withSize(1.5)],
        ['thumbnail', Buffer.alloc(1)]
      ])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the 2 MB model limit', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The deployment is too big. The maximum allowed size for wearable model files is 2 MB. You can upload up to 2097152 bytes but you tried to upload 2621440.'
      )
    })
  })

  describe('and a SKIN wearable has model files totaling less than 8 MB', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'A', hash: 'A' },
        { file: 'C', hash: 'C' },
        { file: 'thumbnail.png', hash: 'thumbnail' }
      ]
      const files = new Map([
        ['A', withSize(1)],
        ['C', withSize(1.5)],
        ['thumbnail', Buffer.alloc(1)]
      ])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { thumbnail: 'thumbnail.png', data: { category: WearableCategory.SKIN } },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a SKIN wearable has model files exceeding 8 MB', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'A', hash: 'A' },
        { file: 'C', hash: 'C' },
        { file: 'D', hash: 'D' },
        { file: 'thumbnail.png', hash: 'thumbnail' }
      ]
      const files = new Map([
        ['A', withSize(3)],
        ['C', withSize(2.5)],
        ['D', withSize(3)],
        ['thumbnail', Buffer.alloc(1)]
      ])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { thumbnail: 'thumbnail.png', data: { category: WearableCategory.SKIN } },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the 8 MB skin limit', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The deployment is too big. The maximum allowed size for wearable model files is 8 MB. You can upload up to 8388608 bytes but you tried to upload 8912896.'
      )
    })
  })

  describe('and the thumbnail file size exceeds the per-pointer limit', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'A', hash: 'A' },
        { file: 'C', hash: 'C' },
        { file: 'thumbnail.png', hash: 'thumbnail' }
      ]
      const files = new Map([
        ['A', withSize(1)],
        ['C', withSize(1)],
        ['thumbnail', withSize(2)]
      ])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createSizeValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the per-pointer wearable limit', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The deployment is too big. The maximum allowed size per pointer is 3 MB for wearable. You can upload up to 3145728 bytes but you tried to upload 4194304.'
      )
    })
  })

  describe('and the total model and thumbnail sizes are within the limit', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'A', hash: 'A' },
        { file: 'C', hash: 'C' },
        { file: 'thumbnail.png', hash: 'thumbnail' }
      ]
      const files = new Map([
        ['A', withSize(1)],
        ['C', withSize(1)],
        ['thumbnail', withSize(0.9)]
      ])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the thumbnail is within 1 MB but model files exceed 2 MB', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'A', hash: 'A' },
        { file: 'B', hash: 'B' },
        { file: 'thumbnail.png', hash: 'thumbnail' }
      ]
      const files = new Map([
        ['A', withSize(1.5)],
        ['B', withSize(1.5)],
        ['thumbnail', withSize(0.5)]
      ])
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the 2 MB model limit', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The deployment is too big. The maximum allowed size for wearable model files is 2 MB. You can upload up to 2097152 bytes but you tried to upload 3145728.'
      )
    })
  })
})

describe('when validating wearable representation content', () => {
  describe('and all representation files are present in the entity content', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'file1', hash: '1' },
        { file: 'file2', hash: '2' }
      ]
      const files = new Map([
        ['file1', withSize(1)],
        ['file2', withSize(0.9)]
      ])
      const entity = buildEntity({ type: EntityType.WEARABLE, metadata: VALID_WEARABLE_METADATA, content })
      const deployment = buildDeployment({ entity, files })
      result = await wearableRepresentationContentValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a representation references a file missing from the content array', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const content = [
        { file: 'notFile1', hash: '1' },
        { file: 'file2', hash: '2' }
      ]
      const files = new Map([
        ['notFile1', withSize(1)],
        ['file2', withSize(0.9)]
      ])
      const entity = buildEntity({ type: EntityType.WEARABLE, metadata: VALID_WEARABLE_METADATA, content })
      const deployment = buildDeployment({ entity, files })
      result = await wearableRepresentationContentValidateFn(deployment)
    })

    it('should return an error reporting the missing representation file', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Representation content: 'file1' is not one of the content files`)
    })
  })

  describe('and the wearable has no representations in metadata', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const { data, ...wearableWithoutData } = { ...VALID_WEARABLE_METADATA }
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: { ...wearableWithoutData, data: { ...data, representations: [] } },
        content: []
      })
      const deployment = buildDeployment({ entity })
      result = await wearableRepresentationContentValidateFn(deployment)
    })

    it('should return an error reporting no representations', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`No wearable representations found`)
    })
  })

  describe('and the wearable has no content', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ type: EntityType.WEARABLE, metadata: VALID_WEARABLE_METADATA, content: [] })
      const deployment = buildDeployment({ entity })
      result = await wearableRepresentationContentValidateFn(deployment)
    })

    it('should return an error reporting no content', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`No content found`)
    })
  })
})

describe('when validating the third party wearable merkle proof', () => {
  const { entity: metadata } = VALID_THIRD_PARTY_WEARABLE

  describe('and the merkle root is verified against the provided proofs', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        pointers: [metadata.id],
        metadata,
        content: Object.keys(metadata.content).map((file) => ({
          file,
          hash: metadata.content[file]
        }))
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the entity is a standard wearable rather than third party', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ type: EntityType.WEARABLE, metadata: VALID_WEARABLE_METADATA, content: [] })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should skip the merkle proof validation and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the metadata id does not match the deployment pointer', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        pointers: ['some-other-pointer'],
        metadata,
        content: Object.keys(metadata.content).map((file) => ({
          file,
          hash: metadata.content[file]
        }))
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return an error reporting the pointer mismatch', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`The id '${metadata.id}' does not match the pointer 'some-other-pointer'`)
    })
  })

  describe('and there are more uploaded files than declared in metadata', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableEntity({
        metadata,
        pointers: [metadata.id],
        content: [
          ...Object.keys(metadata.content).map((file) => ({
            file,
            hash: metadata.content[file]
          })),
          { file: 'some-other-file', hash: 'some-other-hash' }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return an error reporting the content mismatch', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The content declared in the metadata does not match the files uploaded with the entity'
      )
    })
  })

  describe('and there are fewer uploaded files than declared in metadata', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableEntity({
        metadata,
        pointers: [metadata.id],
        content: Object.keys(metadata.content)
          .slice(1)
          .map((file) => ({
            file,
            hash: metadata.content[file]
          }))
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return an error reporting the content mismatch', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The content declared in the metadata does not match the files uploaded with the entity'
      )
    })
  })

  describe('and an uploaded file hash differs from the one declared in metadata', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableEntity({
        metadata,
        pointers: [metadata.id],
        content: [
          { file: Object.keys(metadata.content)[0], hash: 'some-other-hash' },
          ...Object.keys(metadata.content)
            .slice(1)
            .map((file) => ({
              file,
              hash: metadata.content[file]
            }))
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return an error reporting the content mismatch', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The content declared in the metadata does not match the files uploaded with the entity'
      )
    })
  })

  describe('and the proofed metadata has been altered', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        pointers: [metadata.id],
        metadata: { ...metadata, name: 'otherName' },
        content: Object.keys(metadata.content).map((file) => ({
          file,
          hash: metadata.content[file]
        }))
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return an error reporting the metadata hash mismatch', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContainEqual(
        expect.stringContaining('is different to the one calculated from the metadata')
      )
    })
  })

  describe('and the merkle proof hashing keys omit the data field', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const metadataWithoutDataKey = {
        ...metadata,
        merkleProof: {
          ...metadata.merkleProof,
          hashingKeys: metadata.merkleProof.hashingKeys.filter((key) => key !== 'data')
        }
      }
      const entity = buildWearableEntity({
        pointers: [metadata.id],
        metadata: metadataWithoutDataKey,
        content: Object.keys(metadata.content).map((file) => ({
          file,
          hash: metadata.content[file]
        }))
      })
      const deployment = buildDeployment({ entity })
      result = await thirdPartyWearableMerkleProofContentValidateFn(deployment)
    })

    it('should return an error because the proof does not commit the data field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`The third-party wearable merkle proof must commit the 'data' field`)
    })
  })
})

describe('when validating spring bones metadata', () => {
  // VALID_WEARABLE_METADATA's representation has mainFile: 'file1', so the active
  // hash for the representation is whatever 'file1' maps to in entity.content.
  const fileHash = 'bafkreialsvt77jvpy673cnugp5ggnxfaalfncufweayuk3jbxskh3pelkm'
  const file2Hash = 'bafkreigreflbn4w3a36rgg2ywlhf2asebqlsd4skg5q5djpklcdcjkbjvi'
  const baseContent = [
    { file: 'file1', hash: fileHash },
    { file: 'file2', hash: file2Hash }
  ]
  const validBoneParams = {
    stiffness: 2,
    gravityPower: 0,
    gravityDir: [0, -1, 0] as [number, number, number],
    drag: 0.5,
    isRoot: true
  }

  function buildWearableWithSpringBones(springBones: unknown) {
    return buildEntity({
      type: EntityType.WEARABLE,
      metadata: {
        ...VALID_WEARABLE_METADATA,
        data: { ...VALID_WEARABLE_METADATA.data, springBones }
      },
      content: baseContent,
      timestamp
    })
  }

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the springBones field is not present', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: VALID_WEARABLE_METADATA,
        content: baseContent,
        timestamp
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the models map is empty', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({ version: 1, models: {} })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the entry is keyed by a current representation hash with a canonical bone name', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: validBoneParams } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and isRoot is omitted from the bone params', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const { isRoot: _omit, ...paramsWithoutIsRoot } = validBoneParams
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: paramsWithoutIsRoot } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and center is provided as a string', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: { ...validBoneParams, center: 'Avatar_Hips' } } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and two representations share the same GLB hash with one entry in models', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const sharedHash = fileHash
      const entity = buildEntity({
        type: EntityType.WEARABLE,
        metadata: {
          ...VALID_WEARABLE_METADATA,
          data: {
            ...VALID_WEARABLE_METADATA.data,
            representations: [
              {
                bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
                mainFile: 'male/shared.glb',
                contents: ['male/shared.glb'],
                overrideHides: [],
                overrideReplaces: []
              },
              {
                bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseFemale'],
                mainFile: 'female/shared.glb',
                contents: ['female/shared.glb'],
                overrideHides: [],
                overrideReplaces: []
              }
            ],
            springBones: {
              version: 1,
              models: { [sharedHash]: { Hair_springBone: validBoneParams } }
            }
          }
        },
        content: [
          { file: 'male/shared.glb', hash: sharedHash },
          { file: 'female/shared.glb', hash: sharedHash }
        ],
        timestamp
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and models is keyed by a filename instead of a representation hash', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { 'male/AnimeLong.glb': { Hair_springBone_L: validBoneParams } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error reporting the unmatched representation hash', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `springBones.models key male/AnimeLong.glb does not match any current representation hash`
      )
    })
  })

  describe('and models is keyed by a stale hash that no longer matches any representation', () => {
    const staleHash = 'bafkreistaleshashstalehashstalehashstalehashstalehashstalehashstale'
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [staleHash]: { Hair_springBone_L: validBoneParams } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error reporting the unmatched representation hash', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `springBones.models key ${staleHash} does not match any current representation hash`
      )
    })
  })

  describe('and a bone name does not contain the springbone token', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_001: validBoneParams } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error reporting the invalid bone name', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Bone name Hair_001 in model ${fileHash} does not follow the spring bone naming convention`
      )
    })
  })

  describe('and version is not 1', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 10,
        models: { [fileHash]: { Hair_springBone_L: validBoneParams } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the version field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('version'))).toBe(true)
    })
  })

  describe('and stiffness is out of range', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: { ...validBoneParams, stiffness: 6 } } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the stiffness field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('stiffness'))).toBe(true)
    })
  })

  describe('and gravityPower is out of range', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: { ...validBoneParams, gravityPower: 11 } } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the gravityPower field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('gravityPower'))).toBe(true)
    })
  })

  describe('and drag is out of range', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: { ...validBoneParams, drag: 1.5 } } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the drag field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('drag'))).toBe(true)
    })
  })

  describe('and gravityDir has the wrong length', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: { ...validBoneParams, gravityDir: [0, -1] } } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the gravityDir field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('gravityDir'))).toBe(true)
    })
  })

  describe('and gravityDir contains a non-numeric element', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: { [fileHash]: { Hair_springBone_L: { ...validBoneParams, gravityDir: [0, -1, 'x'] } } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the gravityDir field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('gravityDir'))).toBe(true)
    })
  })

  describe('and models is null', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({ version: 1, models: null })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the models field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('models'))).toBe(true)
    })
  })

  describe('and the version field is missing entirely', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        models: { [fileHash]: { Hair_springBone_L: validBoneParams } }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should return an error mentioning the version field', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((e) => e.includes('version'))).toBe(true)
    })
  })

  describe('and multiple models entries are invalid', () => {
    const staleHash = 'bafkreistaleshashstale'
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildWearableWithSpringBones({
        version: 1,
        models: {
          [staleHash]: { Hair_springBone_L: validBoneParams },
          [fileHash]: { Hair_001: validBoneParams }
        }
      })
      result = await springBonesMetadataValidateFn(buildDeployment({ entity }))
    })

    it('should accumulate one error per invalid entry', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `springBones.models key ${staleHash} does not match any current representation hash`
      )
      expect(result.errors).toContain(
        `Bone name Hair_001 in model ${fileHash} does not follow the spring bone naming convention`
      )
    })
  })
})
