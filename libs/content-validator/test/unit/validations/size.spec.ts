import { hashV1 } from '@dcl/hashing'
import { EntityType } from '@dcl/schemas'
import { createSizeValidateFn } from '../../../src/validations/size'
import { ADR_45_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import { buildComponents, buildExternalCalls } from '../../setup/mock'
import type { DeploymentToValidate, ValidationResponse } from '../../../src/types'

const buildFiles = (...files: Array<[hash: string, sizeInMB: number]>): Map<string, Uint8Array> =>
  new Map(files?.map((file) => [file[0], Buffer.alloc(file[1] * 1024 * 1024)]) ?? [])

describe('when validating deployment size', () => {
  describe('and the entity is before ADR-45', () => {
    let validateFn: ReturnType<typeof createSizeValidateFn>

    beforeEach(() => {
      validateFn = createSizeValidateFn(buildComponents())
    })

    describe('and the profile entity exceeds the allowed size per pointer', () => {
      let deployment: DeploymentToValidate
      let result: ValidationResponse

      beforeEach(async () => {
        const bodyBuffer = Buffer.alloc(2.1 * 1024 * 1024)
        const hash = await hashV1(bodyBuffer)
        const entity = buildEntity({
          pointers: ['P1'],
          content: [{ file: 'body.png', hash }],
          metadata: { avatars: [{ avatar: { snapshots: { body: hash } } }] }
        })
        deployment = buildDeployment({
          files: new Map([[hash, bodyBuffer]]),
          entity
        })
        result = await validateFn(deployment)
      })

      it('should return an error reporting the max allowed size per pointer', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          'The deployment is too big. The maximum allowed size per pointer is 2 MB for profile. You can upload up to 2097152 bytes but you tried to upload 2202009.'
        )
      })
    })

    describe('and the profile entity has enough pointers to fit under the limit', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const bodyBuffer = Buffer.alloc(2.1 * 1024 * 1024)
        const hash = await hashV1(bodyBuffer)
        const entity = buildEntity({
          pointers: ['P1', 'P2'],
          content: [{ file: 'body.png', hash }],
          metadata: { avatars: [{ avatar: { snapshots: { body: hash } } }] }
        })
        const deployment = buildDeployment({
          files: new Map([[hash, bodyBuffer]]),
          entity
        })
        result = await validateFn(deployment)
      })

      it('should return ok', () => {
        expect(result.ok).toBe(true)
      })
    })
  })

  describe('and the entity is after ADR-45', () => {
    const timestamp = ADR_45_TIMESTAMP + 1

    describe('and a single uploaded file exceeds the allowed size per pointer', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const validateFn = createSizeValidateFn(buildComponents())
        const content = [{ file: 'C', hash: 'C' }]
        const entity = buildEntity({ content, timestamp, pointers: ['P1'] })
        const files = buildFiles(['C', 2.1])
        const deployment = buildDeployment({ entity, files })
        result = await validateFn(deployment)
      })

      it('should return an error reporting the max allowed size per pointer', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          'The deployment is too big. The maximum allowed size per pointer is 2 MB for profile. You can upload up to 2097152 bytes but you tried to upload 2202009.'
        )
      })
    })

    describe('and the combined size of uploaded and stored content exceeds the limit', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const content = [
          { file: 'A', hash: 'A' },
          { file: 'B', hash: 'B' },
          { file: 'C', hash: 'C' }
        ]
        const contentSizes = new Map([
          ['A', 1024 * 1024 * 5],
          ['B', 1024 * 1024 * 5]
        ])
        const entity = buildEntity({ content, timestamp, pointers: ['P1'], type: EntityType.SCENE })
        const files = buildFiles(['C', 6])
        const deployment = buildDeployment({ entity, files })
        const externalCalls = buildExternalCalls({
          fetchContentFileSize: (hash) => Promise.resolve(contentSizes.get(hash) ?? 0)
        })
        const validateFn = createSizeValidateFn(buildComponents({ externalCalls }))
        result = await validateFn(deployment)
      })

      it('should return an error reporting the max allowed size per pointer for the scene type', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(
          'The deployment is too big. The maximum allowed size per pointer is 15 MB for scene. You can upload up to 15728640 bytes but you tried to upload 16777216.'
        )
      })
    })

    describe('and the size of a referenced stored file cannot be fetched', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const content = [
          { file: 'A', hash: 'A' },
          { file: 'C', hash: 'C' }
        ]
        const entity = buildEntity({ content, timestamp, pointers: ['P1'], type: EntityType.SCENE })
        const files = buildFiles(['C', 3])
        const deployment = buildDeployment({ entity, files })
        const externalCalls = buildExternalCalls({
          fetchContentFileSize: () => Promise.resolve(undefined)
        })
        const validateFn = createSizeValidateFn(buildComponents({ externalCalls }))
        result = await validateFn(deployment)
      })

      it('should return an error reporting the hash that could not be fetched', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(`Couldn't fetch content file with hash: A`)
      })
    })

    describe('and a referenced stored file has size zero', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const content = [
          { file: 'A', hash: 'A' },
          { file: 'C', hash: 'C' }
        ]
        const entity = buildEntity({ content, timestamp, pointers: ['P1'], type: EntityType.SCENE })
        const files = buildFiles(['C', 3])
        const deployment = buildDeployment({ entity, files })
        const externalCalls = buildExternalCalls({
          fetchContentFileSize: () => Promise.resolve(0)
        })
        const validateFn = createSizeValidateFn(buildComponents({ externalCalls }))
        result = await validateFn(deployment)
      })

      it('should return ok', () => {
        expect(result.ok).toBe(true)
      })
    })

    describe('and the content has repeated hashes', () => {
      let result: ValidationResponse

      beforeEach(async () => {
        const content = [
          { file: 'A', hash: 'A' },
          { file: 'B', hash: 'A' },
          { file: 'C', hash: 'C' }
        ]
        const contentSizes = new Map([['A', 1024 * 1024 * 5]])
        const entity = buildEntity({ content, timestamp, pointers: ['P1'], type: EntityType.SCENE })
        const files = buildFiles(['C', 3])
        const deployment = buildDeployment({ entity, files })
        const externalCalls = buildExternalCalls({
          fetchContentFileSize: (hash) => Promise.resolve(contentSizes.get(hash) ?? 0)
        })
        const validateFn = createSizeValidateFn(buildComponents({ externalCalls }))
        result = await validateFn(deployment)
      })

      it('should count the repeated hash only once and return ok', () => {
        expect(result.ok).toBe(true)
      })
    })
  })
})
