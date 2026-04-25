import { ArmatureId, EntityType } from '@dcl/schemas'
import {
  emoteADR287ValidateFn,
  emoteRepresentationContentValidateFn,
  wasCreatedAfterADR74ValidateFn
} from '../../../../src/validations/items/emotes'
import {
  createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn,
  createThumbnailMaxSizeIsNotExceededValidateFn
} from '../../../../src/validations/items/items'
import { createSizeValidateFn } from '../../../../src/validations/size'
import { ADR_74_TIMESTAMP } from '../../../../src/validations/timestamps'
import { buildDeployment } from '../../../setup/deployments'
import { VALID_SOCIAL_EMOTE_METADATA, VALID_STANDARD_EMOTE_METADATA } from '../../../setup/emotes'
import { buildEntity } from '../../../setup/entity'
import { buildComponents, buildExternalCalls, createImage } from '../../../setup/mock'
import type { ValidationResponse } from '../../../../src'

const POST_ADR_74_TIMESTAMP = ADR_74_TIMESTAMP + 1
const PRE_ADR_74_TIMESTAMP = ADR_74_TIMESTAMP - 1
const withSize = (sizeInMB: number): Buffer => Buffer.alloc(sizeInMB * 1024 * 1024)

describe('when validating the emote thumbnail size', () => {
  const fileName = 'thumbnail.png'
  const hash = 'thumbnail'
  let components: ReturnType<typeof buildComponents>
  let validateFn: ReturnType<typeof createThumbnailMaxSizeIsNotExceededValidateFn>

  beforeEach(() => {
    components = buildComponents()
    validateFn = createThumbnailMaxSizeIsNotExceededValidateFn(components)
  })

  describe('and the entity has no content mapping for the thumbnail file name', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const validThumbnailBuffer = await createImage(1024)
      const files = new Map([[hash, validThumbnailBuffer]])
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      result = await validateFn(deployment)
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
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      result = await validateFn(deployment)
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
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      result = await validateFn(deployment)
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
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      result = await validateFn(deployment)
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
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      result = await validateFn(deployment)
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
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      result = await validateFn(deployment)
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
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({
        isContentStoredAlready: async () => new Map([[hash, true]])
      })
      const reuseValidateFn = createThumbnailMaxSizeIsNotExceededValidateFn(buildComponents({ externalCalls }))
      result = await reuseValidateFn(deployment)
    })

    it('should skip thumbnail validation and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating the emote deployment size', () => {
  let components: ReturnType<typeof buildComponents>

  beforeEach(() => {
    components = buildComponents()
  })

  describe('and the model files exceed the 2 MB limit', () => {
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
        type: EntityType.EMOTE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the 2 MB model limit', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The deployment is too big. The maximum allowed size for emote model files is 2 MB. You can upload up to 2097152 bytes but you tried to upload 2621440.'
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
        type: EntityType.EMOTE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createSizeValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the per-pointer emote limit', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The deployment is too big. The maximum allowed size per pointer is 3 MB for emote. You can upload up to 3145728 bytes but you tried to upload 4194304.'
      )
    })
  })

  describe('and all files are within the limits', () => {
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
        type: EntityType.EMOTE,
        metadata: { thumbnail: 'thumbnail.png' },
        content,
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity, files })
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})

describe('when validating emote representation content', () => {
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
      const entity = buildEntity({ type: EntityType.EMOTE, metadata: VALID_STANDARD_EMOTE_METADATA, content })
      const deployment = buildDeployment({ entity, files })
      result = await emoteRepresentationContentValidateFn(deployment)
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
      const entity = buildEntity({ type: EntityType.EMOTE, metadata: VALID_STANDARD_EMOTE_METADATA, content })
      const deployment = buildDeployment({ entity, files })
      result = await emoteRepresentationContentValidateFn(deployment)
    })

    it('should return an error reporting the missing representation file', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Representation content: 'file1' is not one of the content files`)
    })
  })

  describe('and the emote has no representations in metadata', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const { emoteDataADR74, ...emoteWithoutData } = { ...VALID_STANDARD_EMOTE_METADATA }
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: { ...emoteWithoutData, emoteDataADR74: { ...emoteDataADR74, representations: [] } },
        content: [
          { file: 'notFile1', hash: '1' },
          { file: 'file2', hash: '2' }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteRepresentationContentValidateFn(deployment)
    })

    it('should return an error reporting no representations', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`No emote representations found`)
    })
  })

  describe('and the emote has no content', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ type: EntityType.EMOTE, metadata: VALID_STANDARD_EMOTE_METADATA, content: [] })
      const deployment = buildDeployment({ entity })
      result = await emoteRepresentationContentValidateFn(deployment)
    })

    it('should return an error reporting no content', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`No content found`)
    })
  })
})

describe('when validating that the emote was created after ADR-74', () => {
  describe('and the deployment timestamp is after ADR-74', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content: [{ file: 'file1', hash: '1' }],
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await wasCreatedAfterADR74ValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the deployment timestamp is before ADR-74', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content: [{ file: 'file1', hash: '1' }],
        timestamp: PRE_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await wasCreatedAfterADR74ValidateFn(deployment)
    })

    it('should return an error stating emotes did not exist before ADR-74', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `The emote timestamp ${PRE_ADR_74_TIMESTAMP} is before ADR 74. Emotes did not exist before ADR 74.`
      )
    })
  })
})

describe('when validating ADR-287 social emote constraints', () => {
  const buildSocialEmoteEntity = (emoteDataOverrides: Record<string, unknown>): ReturnType<typeof buildEntity> => {
    const { emoteDataADR74, ...emoteWithoutData } = { ...VALID_SOCIAL_EMOTE_METADATA }
    return buildEntity({
      type: EntityType.EMOTE,
      metadata: {
        ...emoteWithoutData,
        emoteDataADR74: { ...emoteDataADR74, ...emoteDataOverrides }
      },
      content: [{ file: 'file1', hash: '1' }],
      timestamp: POST_ADR_74_TIMESTAMP
    })
  }

  describe('and the emote is a standard emote without social emote properties', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_STANDARD_EMOTE_METADATA,
        content: [{ file: 'file1', hash: '1' }],
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the emote has all required social emote properties', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_SOCIAL_EMOTE_METADATA,
        content: [{ file: 'file1', hash: '1' }],
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the social emote is missing startAnimation', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: undefined,
        randomizeOutcomes: false,
        outcomes: [
          {
            title: 'High Five',
            clips: { [ArmatureId.Armature]: { animation: 'HighFive_Avatar' } },
            loop: true
          }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error listing startAnimation as missing', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'For social emote definition, all properties must be present. Missing: startAnimation'
      )
    })
  })

  describe('and the social emote startAnimation is missing the required armature', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature_Prop]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: false,
        outcomes: [
          { title: 'Outcome 1', clips: { [ArmatureId.Armature]: { animation: 'Animation_1' } }, loop: true },
          { title: 'Outcome 2', clips: { [ArmatureId.Armature]: { animation: 'Animation_2' } }, loop: true },
          { title: 'Outcome 3', clips: { [ArmatureId.Armature]: { animation: 'Animation_3' } }, loop: true }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error stating startAnimation properties are invalid', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Some properties of StartAnimation are not valid')
    })
  })

  describe('and the social emote startAnimation contains an unrecognised armature', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' },
          SomeArmature: { animation: 'Animation' }
        },
        randomizeOutcomes: false,
        outcomes: [
          { title: 'Outcome 1', clips: { [ArmatureId.Armature]: { animation: 'Animation_1' } }, loop: true },
          { title: 'Outcome 2', clips: { [ArmatureId.Armature]: { animation: 'Animation_2' } }, loop: true },
          { title: 'Outcome 3', clips: { [ArmatureId.Armature]: { animation: 'Animation_3' } }, loop: true }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error stating startAnimation properties are invalid', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Some properties of StartAnimation are not valid')
    })
  })

  describe('and the social emote is missing randomizeOutcomes', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: undefined,
        outcomes: [
          {
            title: 'High Five',
            clips: { [ArmatureId.Armature]: { animation: 'HighFive_Avatar' } },
            loop: true
          }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error listing randomizeOutcomes as missing', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'For social emote definition, all properties must be present. Missing: randomizeOutcomes'
      )
    })
  })

  describe('and the social emote is missing outcomes', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: false,
        outcomes: undefined
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error listing outcomes as missing', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('For social emote definition, all properties must be present. Missing: outcomes')
    })
  })

  describe('and the social emote is missing both randomizeOutcomes and outcomes', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: undefined,
        outcomes: undefined
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error listing both missing properties', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'For social emote definition, all properties must be present. Missing: randomizeOutcomes, outcomes'
      )
    })
  })

  describe('and the social emote outcomes array is empty', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: false,
        outcomes: []
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error stating outcomes array cannot be empty', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Outcomes array cannot be empty')
    })
  })

  describe('and the social emote outcomes array exceeds the maximum length', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: false,
        outcomes: [
          { title: 'Outcome 1', clips: { [ArmatureId.Armature]: { animation: 'Animation_1' } }, loop: true },
          { title: 'Outcome 2', clips: { [ArmatureId.Armature]: { animation: 'Animation_2' } }, loop: true },
          { title: 'Outcome 3', clips: { [ArmatureId.Armature]: { animation: 'Animation_3' } }, loop: true },
          { title: 'Outcome 4', clips: { [ArmatureId.Armature]: { animation: 'Animation_4' } }, loop: true }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error stating outcomes array can contain up to 3 items', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Outcomes array can contain up to 3 items')
    })
  })

  describe('and the social emote outcomes array has exactly 3 items', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: false,
        outcomes: [
          { title: 'Outcome 1', clips: { [ArmatureId.Armature]: { animation: 'Animation_1' } }, loop: true },
          { title: 'Outcome 2', clips: { [ArmatureId.Armature]: { animation: 'Animation_2' } }, loop: true },
          { title: 'Outcome 3', clips: { [ArmatureId.Armature]: { animation: 'Animation_3' } }, loop: true }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the social emote outcomes array has a single item', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.EMOTE,
        metadata: VALID_SOCIAL_EMOTE_METADATA,
        content: [{ file: 'file1', hash: '1' }],
        timestamp: POST_ADR_74_TIMESTAMP
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the social emote outcomes array contains an outcome with an invalid property', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildSocialEmoteEntity({
        startAnimation: {
          loop: true,
          [ArmatureId.Armature]: { animation: 'HighFive_Start' }
        },
        randomizeOutcomes: false,
        outcomes: [
          { title: 'Outcome 1', clips: { [ArmatureId.Armature]: { animation: 'Animation_1' } }, loop: true },
          { title: 'Outcome 2', clips: { [ArmatureId.Armature]: { animation: 'Animation_2' } }, loop: true },
          { title2: 'Outcome 3', clips: { [ArmatureId.Armature]: { animation: 'Animation_3' } }, loop: true }
        ]
      })
      const deployment = buildDeployment({ entity })
      result = await emoteADR287ValidateFn(deployment)
    })

    it('should return an error stating outcome properties are invalid', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('Some properties of Outcome are not valid')
    })
  })
})
