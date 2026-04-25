import { EntityType } from '@dcl/schemas'
import { createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn } from '../../../../src/validations/items/items'
import { buildAuditInfo } from '../../../setup/deployments'
import { buildComponents, buildExternalCalls } from '../../../setup/mock'
import type { DeploymentToValidate, ValidationResponse } from '../../../../src/types'

const SAMPLE_ENTITY_ID = 'bafybeihz4c4cf4icnlh6yjtt7fooaeih3dkv2mz6umod7dybenzmsxkzvq'

describe('when validating deployment max size excluding thumbnail', () => {
  describe('and the entity type is not supported', () => {
    const unsupportedType = 'asdf'
    let result: ValidationResponse

    beforeEach(async () => {
      const components = buildComponents()
      const deployment = {
        entity: {
          version: 'v3',
          type: unsupportedType,
          pointers: ['P1'],
          timestamp: Date.now(),
          content: [],
          id: SAMPLE_ENTITY_ID
        },
        auditInfo: buildAuditInfo(),
        files: new Map()
      } as unknown as DeploymentToValidate
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error stating the entity type is not supported', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Type ${unsupportedType} is not supported yet`)
    })
  })

  describe('and the metadata thumbnail does not match any content file', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const components = buildComponents()
      const deployment = {
        entity: {
          version: 'v3',
          type: EntityType.EMOTE,
          pointers: ['P1'],
          timestamp: Date.now(),
          content: [{ file: 'the-thumbnail2', hash: 'hash1' }],
          id: SAMPLE_ENTITY_ID,
          metadata: { thumbnail: 'the-thumbnail' }
        }
      } as unknown as DeploymentToValidate
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the missing thumbnail hash', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain("Couldn't find the thumbnail hash")
    })
  })

  describe('and the thumbnail content file size cannot be fetched', () => {
    const thumbnailHash = 'hash1'
    let result: ValidationResponse

    beforeEach(async () => {
      const components = buildComponents({
        externalCalls: buildExternalCalls({
          fetchContentFileSize: () => Promise.resolve(undefined)
        })
      })
      const deployment = {
        entity: {
          version: 'v3',
          type: EntityType.EMOTE,
          pointers: ['P1'],
          timestamp: Date.now(),
          content: [{ file: 'the-thumbnail', hash: thumbnailHash }],
          id: SAMPLE_ENTITY_ID,
          metadata: { thumbnail: 'the-thumbnail' }
        },
        files: new Map()
      } as unknown as DeploymentToValidate
      const validateFn = createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
      result = await validateFn(deployment)
    })

    it('should return an error reporting the missing content file', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Couldn't fetch content file with hash: ${thumbnailHash}`)
    })
  })
})
