import { EntityType } from '@dcl/schemas'
import { createStagingValidator, createValidator } from '../../src'
import { OK, validationFailed } from '../../src/types'
import { ADR_45_TIMESTAMP } from '../../src/validations/timestamps'
import { buildDeployment } from '../setup/deployments'
import { buildEntity } from '../setup/entity'
import { buildComponents } from '../setup/mock'
import type { ValidateFn, ValidationResponse } from '../../src/types'

const buildValidSceneDeployment = () =>
  buildDeployment({
    entity: buildEntity({
      type: EntityType.SCENE,
      metadata: { main: 'bin/main.js', scene: { base: '0,0', parcels: ['0,0'] } },
      pointers: ['0,0'],
      timestamp: ADR_45_TIMESTAMP - 1000
    })
  })

// A scene that references a content file which was NOT uploaded and is not stored: the full validator
// rejects it (its size can't be computed), but a staging deployment is expected to be accepted because
// completeness/size are only checked once all content is present.
const buildIncompleteSceneDeployment = () =>
  buildDeployment({
    entity: buildEntity({
      type: EntityType.SCENE,
      metadata: { main: 'bin/main.js', scene: { base: '0,0', parcels: ['0,0'] } },
      pointers: ['0,0'],
      content: [{ file: 'bin/main.js', hash: 'QmNotUploadedHash' }],
      timestamp: ADR_45_TIMESTAMP - 1000
    })
  })

describe('when calling createStagingValidator', () => {
  describe('and includeAccessCheck is true and every staging validation passes', () => {
    let result: ValidationResponse
    let accessValidateFn: jest.MockedFunction<ValidateFn>

    beforeEach(async () => {
      accessValidateFn = jest.fn().mockResolvedValue(OK) as jest.MockedFunction<ValidateFn>
      const validateFn = createStagingValidator(buildComponents({ accessValidateFn }), { includeAccessCheck: true })
      result = await validateFn(buildValidSceneDeployment())
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return ok and run the access check', () => {
      expect(result).toEqual(OK)
      expect(accessValidateFn).toHaveBeenCalled()
    })
  })

  describe('and the access check is not requested', () => {
    let result: ValidationResponse
    let accessValidateFn: jest.MockedFunction<ValidateFn>

    beforeEach(async () => {
      // Access would fail, but it must not run when includeAccessCheck is not set.
      accessValidateFn = jest
        .fn()
        .mockResolvedValue(validationFailed('access denied')) as jest.MockedFunction<ValidateFn>
      const validateFn = createStagingValidator(buildComponents({ accessValidateFn }))
      result = await validateFn(buildValidSceneDeployment())
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return ok without running the access check', () => {
      expect(result).toEqual(OK)
      expect(accessValidateFn).not.toHaveBeenCalled()
    })
  })

  describe('and includeAccessCheck is true but the access check fails', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const accessValidateFn = jest
        .fn()
        .mockResolvedValue(validationFailed('access denied')) as jest.MockedFunction<ValidateFn>
      const validateFn = createStagingValidator(buildComponents({ accessValidateFn }), { includeAccessCheck: true })
      result = await validateFn(buildValidSceneDeployment())
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return the access error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('access denied')
    })
  })

  describe('and the deployment references content that is not yet present', () => {
    let stagingResult: ValidationResponse
    let fullResult: ValidationResponse

    beforeEach(async () => {
      const components = buildComponents({
        accessValidateFn: jest.fn().mockResolvedValue(OK) as jest.MockedFunction<ValidateFn>
      })
      const deployment = buildIncompleteSceneDeployment()
      stagingResult = await createStagingValidator(components, { includeAccessCheck: true })(deployment)
      fullResult = await createValidator(components)(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should accept it for staging even though the full validator rejects it (size/completeness omitted)', () => {
      expect(stagingResult).toEqual(OK)
      expect(fullResult.ok).toBe(false)
    })
  })

  describe('and an uploaded file is not referenced by the entity', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const deployment = buildValidSceneDeployment()
      // Upload a file whose hash is neither referenced in entity.content nor the entity id.
      deployment.files.set('QmUnreferencedUploadedFile', new Uint8Array([1, 2, 3]))
      const validateFn = createStagingValidator(
        buildComponents({ accessValidateFn: jest.fn().mockResolvedValue(OK) as jest.MockedFunction<ValidateFn> })
      )
      result = await validateFn(deployment)
    })

    it('should reject it — the staging subset enforces the no-unreferenced-files validation', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((error) => error.includes('not referenced in the entity'))).toBe(true)
    })
  })

  describe('and a post-ADR-45 scene has an invalid content hash', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      // Past ADR-45 the IPFS-hashing validation is active; a non-IPFSv2 hash must be rejected. This
      // confirms the ADR-gated validations are actually run by the staging validator (a pre-ADR-45
      // fixture would skip them).
      const deployment = buildDeployment({
        entity: buildEntity({
          type: EntityType.SCENE,
          metadata: { main: 'bin/main.js', scene: { base: '0,0', parcels: ['0,0'] } },
          pointers: ['0,0'],
          content: [{ file: 'bin/main.js', hash: 'not-a-valid-ipfs-hash' }],
          timestamp: ADR_45_TIMESTAMP + 1000
        })
      })
      const validateFn = createStagingValidator(
        buildComponents({ accessValidateFn: jest.fn().mockResolvedValue(OK) as jest.MockedFunction<ValidateFn> })
      )
      result = await validateFn(deployment)
    })

    it('should reject it via the IPFS-hashing validation', () => {
      expect(result.ok).toBe(false)
      expect(result.errors?.some((error) => error.includes('IPFS'))).toBe(true)
    })
  })
})
