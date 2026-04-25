import { createFaceThumbnailValidateFn, createProfileImagesValidateFn } from '../../../src/validations/profile'
import { ADR_45_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildProfileEntity } from '../../setup/entity'
import { buildComponents, buildExternalCalls, createImage } from '../../setup/mock'
import { VALID_PROFILE_METADATA } from '../../setup/profiles'
import type { DeploymentToValidate, ValidationResponse } from '../../../src/types'

describe('when validating face thumbnail', () => {
  let validateFn: ReturnType<typeof createFaceThumbnailValidateFn>
  let deployment: DeploymentToValidate
  let files: Map<string, Uint8Array>
  let face256Hash: string
  let isContentStoredAlreadyMock: Map<string, boolean>

  beforeEach(() => {
    face256Hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
    files = new Map()
    isContentStoredAlreadyMock = new Map()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the face256 hash is missing from metadata', () => {
    beforeEach(() => {
      deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_45_TIMESTAMP + 1000,
          metadata: {
            avatars: [
              {
                ...VALID_PROFILE_METADATA.avatars[0],
                avatar: {
                  ...VALID_PROFILE_METADATA.avatars[0].avatar,
                  snapshots: undefined
                }
              }
            ]
          }
        }),
        files
      })
      const components = buildComponents()
      validateFn = createFaceThumbnailValidateFn(components)
    })

    it('should return an error stating that the hash is missing', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't find hash for face256 thumbnail file with name: 'face256'`)
    })
  })

  describe('and the profile has a valid a face256 thumbnail in the metadata', () => {
    beforeEach(() => {
      deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_45_TIMESTAMP + 1000,
          metadata: VALID_PROFILE_METADATA
        }),
        files
      })

      const components = buildComponents({
        externalCalls: buildExternalCalls({
          isContentStoredAlready: jest.fn().mockResolvedValue(isContentStoredAlreadyMock)
        })
      })
      validateFn = createFaceThumbnailValidateFn(components)
    })

    describe('and the face256 thumbnail is already stored', () => {
      beforeEach(async () => {
        const face256Buffer = await createImage(256, 'png')
        files.set(face256Hash, new Uint8Array(face256Buffer))
        isContentStoredAlreadyMock.set(face256Hash, true)
      })

      it('should return ok', async () => {
        const result: ValidationResponse = await validateFn(deployment)
        expect(result.ok).toBe(true)
      })
    })

    describe('and the face256 thumbnail is not already stored', () => {
      beforeEach(() => {
        isContentStoredAlreadyMock.set(face256Hash, false)
      })

      describe('and the thumbnail is valid', () => {
        beforeEach(async () => {
          const face256Buffer = await createImage(256, 'png')
          files.set(face256Hash, new Uint8Array(face256Buffer))
        })

        it('should return ok', async () => {
          const result: ValidationResponse = await validateFn(deployment)
          expect(result.ok).toBe(true)
        })
      })

      describe('and the thumbnail file is not in the uploaded files', () => {
        beforeEach(() => {
          files.delete(face256Hash)
        })

        it('should return an error stating that the thumbnail file was not found', async () => {
          const result: ValidationResponse = await validateFn(deployment)
          expect(result.ok).toBe(false)
          expect(result.errors).toContain(`Couldn't find thumbnail file with hash: ${face256Hash}`)
        })
      })

      describe('and the thumbnail has invalid format', () => {
        beforeEach(async () => {
          const face256Buffer = await createImage(256, 'jpg')
          files.set(face256Hash, new Uint8Array(face256Buffer))
        })

        it('should return an error stating that the format is invalid', async () => {
          const result: ValidationResponse = await validateFn(deployment)
          expect(result.ok).toBe(false)
          expect(result.errors).toContain(`Invalid or unknown image format. Only 'PNG' format is accepted.`)
        })
      })

      describe('and the thumbnail has an invalid size', () => {
        beforeEach(async () => {
          const face256Buffer = await createImage(512, 'png')
          files.set(face256Hash, new Uint8Array(face256Buffer))
        })

        it('should return an error stating that the thumbnail has an invalid size', async () => {
          const result: ValidationResponse = await validateFn(deployment)
          expect(result.ok).toBe(false)
          expect(result.errors).toContain(`Invalid face256 thumbnail image size (width = 512 / height = 512)`)
        })
      })

      describe('and the thumbnail is corrupted', () => {
        beforeEach(() => {
          files.set(face256Hash, new Uint8Array([1, 2, 3]))
        })

        it('should return an error stating that the thumbnail is not a valid image', async () => {
          const result: ValidationResponse = await validateFn(deployment)
          expect(result.ok).toBe(false)
          expect(result.errors).toContain(`Couldn't parse face256 thumbnail, please check image format.`)
        })
      })
    })
  })
})

describe('when validating face thumbnail with multiple avatars', () => {
  describe('and the first avatar face256 is already stored but the second is not', () => {
    let result: ValidationResponse
    const storedHash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
    const unstoredHash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5x'

    beforeEach(async () => {
      const files = new Map<string, Uint8Array>()
      const deployment = buildDeployment({
        entity: buildProfileEntity({
          timestamp: ADR_45_TIMESTAMP + 1000,
          metadata: {
            avatars: [
              {
                ...VALID_PROFILE_METADATA.avatars[0],
                avatar: { ...VALID_PROFILE_METADATA.avatars[0].avatar, snapshots: { face256: storedHash } }
              },
              {
                ...VALID_PROFILE_METADATA.avatars[0],
                avatar: { ...VALID_PROFILE_METADATA.avatars[0].avatar, snapshots: { face256: unstoredHash } }
              }
            ]
          }
        }),
        files
      })

      const components = buildComponents({
        externalCalls: buildExternalCalls({
          isContentStoredAlready: jest.fn().mockResolvedValue(
            new Map([
              [storedHash, true],
              [unstoredHash, false]
            ])
          )
        })
      })
      const validateFn = createFaceThumbnailValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should fail because the second avatar face256 is not stored and not in files', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't find thumbnail file with hash: ${unstoredHash}`)
    })
  })
})

describe('when validating profile images', () => {
  let validateFn: ReturnType<typeof createProfileImagesValidateFn>
  let deployment: DeploymentToValidate
  let files: Map<string, Uint8Array>
  let calculatedFileHashes: Map<string, { calculatedHash: string; buffer: Uint8Array }>
  let face256Hash: string
  let bodyHash: string

  beforeEach(() => {
    jest.clearAllMocks()

    files = new Map()
    calculatedFileHashes = new Map()
    deployment = buildDeployment({
      entity: buildProfileEntity({
        timestamp: ADR_45_TIMESTAMP + 1000,
        metadata: VALID_PROFILE_METADATA
      }),
      files
    })
    const components = buildComponents({
      externalCalls: buildExternalCalls({
        calculateFilesHashes: jest.fn().mockResolvedValue(calculatedFileHashes)
      })
    })
    validateFn = createProfileImagesValidateFn(components)
  })

  describe('and all image hashes match', () => {
    beforeEach(() => {
      face256Hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
      bodyHash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      files.set(face256Hash, new Uint8Array())
      files.set(bodyHash, new Uint8Array())
      calculatedFileHashes.set(face256Hash, { calculatedHash: face256Hash, buffer: new Uint8Array() })
      calculatedFileHashes.set(bodyHash, { calculatedHash: bodyHash, buffer: new Uint8Array() })
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })

  describe('and the body hash does not match', () => {
    let wrongBodyHash: string

    beforeEach(() => {
      wrongBodyHash = 'aDifferentHash'
      face256Hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
      bodyHash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      deployment.entity.metadata.avatars[0].avatar.snapshots = {
        face256: face256Hash,
        body: bodyHash
      }
      calculatedFileHashes.set(face256Hash, { calculatedHash: face256Hash, buffer: new Uint8Array() })
      calculatedFileHashes.set(bodyHash, { calculatedHash: wrongBodyHash, buffer: new Uint8Array() })
      files.set(face256Hash, new Uint8Array())
      files.set(bodyHash, new Uint8Array())
    })

    it('should return an error stating that the body hash is incorrect', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Mismatch of hash found for file. Expected: ${bodyHash} but got ${wrongBodyHash}`)
    })
  })

  describe('and the face256 hash does not match', () => {
    let wrongFace256Hash: string
    beforeEach(() => {
      wrongFace256Hash = 'aDifferentHash'
      face256Hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
      bodyHash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      deployment.entity.metadata.avatars[0].avatar.snapshots = {
        face256: face256Hash,
        body: bodyHash
      }
      calculatedFileHashes.set(face256Hash, { calculatedHash: wrongFace256Hash, buffer: new Uint8Array() })
      calculatedFileHashes.set(bodyHash, { calculatedHash: bodyHash, buffer: new Uint8Array() })
      files.set(face256Hash, new Uint8Array())
      files.set(bodyHash, new Uint8Array())
    })

    it('should return an error stating that the face256 hash is incorrect', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Mismatch of hash found for file. Expected: ${face256Hash} but got ${wrongFace256Hash}`
      )
    })
  })

  describe('and both hashes do not match', () => {
    let wrongFace256Hash: string
    let wrongBodyHash: string

    beforeEach(() => {
      wrongFace256Hash = 'aDifferentHash'
      wrongBodyHash = 'aDifferentHash'
      face256Hash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s'
      bodyHash = 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      deployment.entity.metadata.avatars[0].avatar.snapshots = {
        face256: face256Hash,
        body: bodyHash
      }
      calculatedFileHashes.set(face256Hash, { calculatedHash: wrongFace256Hash, buffer: new Uint8Array() })
      calculatedFileHashes.set(bodyHash, { calculatedHash: wrongBodyHash, buffer: new Uint8Array() })
      files.set(face256Hash, new Uint8Array())
      files.set(bodyHash, new Uint8Array())
    })

    it('should return an error stating that both hashes are incorrect', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Mismatch of hash found for file. Expected: ${face256Hash} but got ${wrongFace256Hash}`
      )
      expect(result.errors).toContain(`Mismatch of hash found for file. Expected: ${bodyHash} but got ${wrongBodyHash}`)
    })
  })

  describe('and the face256 hash is missing', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.snapshots = {
        face256: undefined,
        body: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5t'
      }
    })

    it('should return an error stating that the face256 hash is missing', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't find hash for face or body thumbnails on profile metadata`)
    })
  })

  describe('and body hash is missing', () => {
    beforeEach(() => {
      deployment.entity.metadata.avatars[0].avatar.snapshots = {
        face256: 'bafybeiasb5vpmaounyilfuxbd3lryvosl4yefqrfahsb2esg46q6tu6y5s',
        body: undefined
      }
    })

    it('should return an error stating that the body hash is missing', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't find hash for face or body thumbnails on profile metadata`)
    })
  })
})
