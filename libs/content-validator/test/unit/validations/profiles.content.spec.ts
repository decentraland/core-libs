import type { ContentMapping } from '@dcl/schemas'
import {
  allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn,
  allMandatoryContentFilesArePresentValidateFn,
  entityShouldNotHaveContentFilesValidateFn
} from '../../../src/validations/profile'
import { ADR_158_TIMESTAMP, ADR_290_REJECTED_TIMESTAMP, ADR_45_TIMESTAMP } from '../../../src/validations/timestamps'
import {
  validateAfterADR290RejectedTimestamp,
  validateUpToADR290OptionalityTimestamp
} from '../../../src/validations/validations'
import { buildDeployment } from '../../setup/deployments'
import { buildProfileEntity } from '../../setup/entity'
import { VALID_PROFILE_METADATA } from '../../setup/profiles'
import type { DeploymentToValidate, ValidateFn, ValidationResponse } from '../../../src/types'

jest.mock('../../../src/validations/validations', () => ({
  ...jest.requireActual('../../../src/validations/validations'),
  validateUpToADR290OptionalityTimestamp: jest.fn((_fromTimestamp: number, validateFn: ValidateFn) => validateFn),
  validateAfterADR290RejectedTimestamp: jest.fn((validateFn: ValidateFn) => validateFn)
}))

const mockValidateUpToADR290OptionalityTimestamp = validateUpToADR290OptionalityTimestamp as jest.MockedFunction<
  typeof validateUpToADR290OptionalityTimestamp
>
const mockValidateAfterADR290RejectedTimestamp = validateAfterADR290RejectedTimestamp as jest.MockedFunction<
  typeof validateAfterADR290RejectedTimestamp
>

describe('when validating that all content files correspond to at least one avatar snapshot', () => {
  let deployment: DeploymentToValidate
  let content: ContentMapping[]

  beforeEach(() => {
    jest.clearAllMocks()
    content = []
    deployment = buildDeployment({
      entity: buildProfileEntity({ timestamp: ADR_45_TIMESTAMP + 1000, content, metadata: VALID_PROFILE_METADATA }),
      files: new Map()
    })
  })

  it('should call validateUpToADR290OptionalityTimestamp with ADR_45_TIMESTAMP', async () => {
    await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
    expect(mockValidateUpToADR290OptionalityTimestamp).toHaveBeenCalledWith(ADR_45_TIMESTAMP, expect.any(Function))
  })

  describe('and there is a content file that corresponds to face256 snapshot', () => {
    beforeEach(() => {
      const hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
      content.push({ file: 'face256.png', hash })
    })

    it('should return ok', async () => {
      const result: ValidationResponse =
        await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and there is a content file that corresponds to body snapshot', () => {
    beforeEach(() => {
      const hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      content.push({ file: 'body.png', hash })
    })

    it('should return ok', async () => {
      const result: ValidationResponse =
        await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and there is a content file that does not correspond to any snapshot', () => {
    let invalidFile: string
    let invalidHash: string

    beforeEach(() => {
      invalidFile = 'invalid.png'
      invalidHash = 'invalidHash'
      content.push({ file: invalidFile, hash: invalidHash })
    })

    it('should return an error with the file name and hash', async () => {
      const result: ValidationResponse =
        await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `This file is not expected: 'invalid.png' or its hash is invalid: 'invalidHash'. Please, include only valid snapshot files.`
      )
    })
  })

  describe('and there is a content file with a wrong hash for the snapshot', () => {
    let wrongHash: string

    beforeEach(() => {
      wrongHash = 'wrongHashForFace256'
      content.push({ file: 'face256.png', hash: wrongHash })
    })

    it('should return an error with the file name and hash', async () => {
      const result: ValidationResponse =
        await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `This file is not expected: 'face256.png' or its hash is invalid: 'wrongHashForFace256'. Please, include only valid snapshot files.`
      )
    })
  })

  describe('and there is a content file with a multi-dot filename like snapshot.face256.png', () => {
    beforeEach(() => {
      const hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
      deployment.entity.metadata = {
        avatars: [
          {
            ...VALID_PROFILE_METADATA.avatars[0],
            avatar: {
              ...VALID_PROFILE_METADATA.avatars[0].avatar,
              snapshots: { 'snapshot.face256': hash }
            }
          }
        ]
      }
      content.push({ file: 'snapshot.face256.png', hash })
    })

    it('should strip only the last extension and match the snapshot key', async () => {
      const result: ValidationResponse =
        await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe("and the entity's metadata has no avatars", () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars = []
      content.push({ file: 'face256.png', hash: 'someHash' })
    })

    it('should return an error', async () => {
      const result: ValidationResponse =
        await allContentFilesCorrespondToAtLeastOneAvatarSnapshotAfterADR45ValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Entity is missing metadata or avatars`)
    })
  })
})

describe('when validating that all mandatory content files are present', () => {
  let deployment: DeploymentToValidate
  let content: ContentMapping[]
  let files: Map<string, Uint8Array>

  beforeEach(() => {
    jest.clearAllMocks()
    content = []
    files = new Map()
    deployment = buildDeployment({
      entity: buildProfileEntity({ timestamp: ADR_158_TIMESTAMP + 1000, content }),
      files
    })
  })

  it('should call validateUpToADR290OptionalityTimestamp with ADR_158_TIMESTAMP', async () => {
    await allMandatoryContentFilesArePresentValidateFn(deployment)
    expect(mockValidateUpToADR290OptionalityTimestamp).toHaveBeenCalledWith(ADR_158_TIMESTAMP, expect.any(Function))
  })

  describe('and both mandatory files are present', () => {
    beforeEach(() => {
      content.push({ file: 'body.png', hash: 'hash1' })
      content.push({ file: 'face256.png', hash: 'hash2' })
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await allMandatoryContentFilesArePresentValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and mandatory files use different case', () => {
    beforeEach(() => {
      content.push({ file: 'BODY.PNG', hash: 'hash1' })
      content.push({ file: 'FACE256.PNG', hash: 'hash2' })
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await allMandatoryContentFilesArePresentValidateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and body.png is missing', () => {
    beforeEach(() => {
      content.push({ file: 'face256.png', hash: 'hash2' })
    })

    it('should return an error with the missing file name', async () => {
      const result: ValidationResponse = await allMandatoryContentFilesArePresentValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Profile entity is missing file 'body.png'`)
    })
  })

  describe('and face256.png is missing', () => {
    beforeEach(() => {
      content.push({ file: 'body.png', hash: 'hash1' })
    })

    it('should return an error with missing file name', async () => {
      const result: ValidationResponse = await allMandatoryContentFilesArePresentValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Profile entity is missing file 'face256.png'`)
    })
  })

  describe('and both mandatory files are missing', () => {
    it('should return an error with both missing file names', async () => {
      const result: ValidationResponse = await allMandatoryContentFilesArePresentValidateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Profile entity is missing file 'body.png'`)
      expect(result.errors).toContain(`Profile entity is missing file 'face256.png'`)
    })
  })

  describe('and entity.content is undefined', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_158_TIMESTAMP + 1000,
          content: undefined as unknown as ContentMapping[]
        }),
        files
      })
      result = await allMandatoryContentFilesArePresentValidateFn(deployment)
    })

    it('should return an error about missing files instead of throwing', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Profile entity is missing file 'body.png'`)
    })
  })
})

describe('when validating that the entity should not have content files', () => {
  let deployment: DeploymentToValidate
  let content: ContentMapping[]
  let files: Map<string, Uint8Array>

  beforeEach(() => {
    jest.clearAllMocks()
    content = []
    files = new Map()
    deployment = buildDeployment({
      entity: buildProfileEntity({ timestamp: ADR_290_REJECTED_TIMESTAMP + 1, content }),
      files
    })
  })

  it('should call validateAfterADR290RejectedTimestamp', async () => {
    await entityShouldNotHaveContentFilesValidateFn(deployment)
    expect(mockValidateAfterADR290RejectedTimestamp).toHaveBeenCalledWith(expect.any(Function))
  })

  describe('and the entity is a profile', () => {
    describe('and the profile has no content files', () => {
      it('should return ok', async () => {
        const result: ValidationResponse = await entityShouldNotHaveContentFilesValidateFn(deployment)
        expect(result.ok).toBe(true)
      })
    })

    describe('and the profile only has the entity file', () => {
      beforeEach(() => {
        files.set('entityHash', new Uint8Array())
      })

      it('should return ok', async () => {
        const result: ValidationResponse = await entityShouldNotHaveContentFilesValidateFn(deployment)
        expect(result.ok).toBe(true)
      })
    })

    describe('and the entity has content', () => {
      beforeEach(() => {
        content.push({ file: 'body.png', hash: 'hash1' })
      })

      it('should return an error with the content file name', async () => {
        const result: ValidationResponse = await entityShouldNotHaveContentFilesValidateFn(deployment)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(`Entity has content files when it should not: body.png`)
      })
    })

    describe('and the entity has uploaded files beyond the entity file', () => {
      beforeEach(() => {
        files.set('entityHash', new Uint8Array())
        files.set('hash1', new Uint8Array())
      })

      it('should return an error with the uploaded file hashes', async () => {
        const result: ValidationResponse = await entityShouldNotHaveContentFilesValidateFn(deployment)
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(`Entity has uploaded files when it should not: entityHash, hash1`)
      })
    })
  })
})
