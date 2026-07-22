import type { ContentMapping } from '@dcl/schemas'
import { EntityType } from '@dcl/schemas'
import { embeddedThumbnail, noWorldsConfigurationValidateFn } from '../../../src/validations/scene'
import { ADR_173_TIMESTAMP, ADR_236_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import { createImage } from '../../setup/mock'
import { VALID_SCENE_METADATA } from '../../setup/scenes'
import type { ValidationResponse } from '../../../src'

describe('when validating the scene has no worldConfiguration', () => {
  const timestamp = ADR_173_TIMESTAMP + 1

  describe('and the scene.json has no worldConfiguration section', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ type: EntityType.SCENE, metadata: VALID_SCENE_METADATA, timestamp })
      const deployment = buildDeployment({ entity, files: new Map() })
      result = await noWorldsConfigurationValidateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the scene.json has a worldConfiguration section', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: { ...VALID_SCENE_METADATA, worldConfiguration: { name: 'some-name.dcl.eth' } },
        timestamp
      })
      const deployment = buildDeployment({ entity, files: new Map() })
      result = await noWorldsConfigurationValidateFn(deployment)
    })

    it('should return an error referencing ADR-173', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The scene.json contains a worldConfiguration section, which is not allowed for Genesis City scenes (see ADR-173: http://adr.decentraland.org/adr/ADR-173). Please remove it and try again.'
      )
    })
  })
})

describe('when validating that the scene thumbnail is embedded', () => {
  const timestamp = ADR_236_TIMESTAMP + 1
  const content = [{ file: 'thumbnail.png', hash: 'thumbnailHash' }]
  let files: Map<string, Uint8Array>

  beforeEach(async () => {
    files = new Map()
    files.set('thumbnailHash', await createImage(1024))
  })

  describe('and the thumbnail references an embedded file', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: {
          ...VALID_SCENE_METADATA,
          display: { ...VALID_SCENE_METADATA.display, navmapThumbnail: 'thumbnail.png' }
        },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await embeddedThumbnail(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the thumbnail is an absolute URL instead of an embedded file', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: {
          ...VALID_SCENE_METADATA,
          display: { ...VALID_SCENE_METADATA.display, navmapThumbnail: 'https://example.com/image.png' }
        },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await embeddedThumbnail(deployment)
    })

    it('should return an error stating the thumbnail must be a relative path', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        "Scene thumbnail 'https://example.com/image.png' must be a relative path to a file included in the deployment."
      )
    })
  })

  describe('and the thumbnail is an absolute URL with HTML-breakout characters that is also declared as a content file', () => {
    let result: ValidationResponse
    let breakoutThumbnail: string

    beforeEach(async () => {
      breakoutThumbnail = 'https://example.com/x"><script>alert(1)</script><meta name="y'
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: {
          ...VALID_SCENE_METADATA,
          display: { ...VALID_SCENE_METADATA.display, navmapThumbnail: breakoutThumbnail }
        },
        content: [{ file: breakoutThumbnail, hash: 'thumbnailHash' }],
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await embeddedThumbnail(deployment)
    })

    it('should reject the deployment instead of accepting the crafted filename', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Scene thumbnail '${breakoutThumbnail}' must be a relative path to a file included in the deployment.`
      )
    })
  })

  describe('and the thumbnail is a relative path inside a subdirectory', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: {
          ...VALID_SCENE_METADATA,
          display: { ...VALID_SCENE_METADATA.display, navmapThumbnail: 'images/thumbnail.png' }
        },
        content: [{ file: 'images/thumbnail.png', hash: 'thumbnailHash' }],
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await embeddedThumbnail(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the thumbnail is a non-relative value that is also declared as a content file', () => {
    const rejectedThumbnails = [
      { description: 'a protocol-relative url', value: '//evil.example/x.png' },
      { description: 'a root-absolute path', value: '/thumb.png' },
      { description: 'a data uri', value: 'data:text/html,<b>x</b>' },
      { description: 'a javascript uri', value: 'javascript:alert(1)' },
      { description: 'a mixed-case http scheme', value: 'HtTpS://evil.example/x.png' },
      { description: 'a path with leading whitespace', value: ' thumb.png' },
      { description: 'a path with trailing whitespace', value: 'thumb.png ' },
      { description: 'a path containing a control character', value: 'thumb\nname.png' },
      { description: 'a relative path containing HTML-breakout characters', value: 'thumb".png' }
    ]

    rejectedThumbnails.forEach(({ description, value }) => {
      describe(`and it is ${description}`, () => {
        let result: ValidationResponse

        beforeEach(async () => {
          const entity = buildEntity({
            type: EntityType.SCENE,
            metadata: {
              ...VALID_SCENE_METADATA,
              display: { ...VALID_SCENE_METADATA.display, navmapThumbnail: value }
            },
            content: [{ file: value, hash: 'thumbnailHash' }],
            timestamp
          })
          const deployment = buildDeployment({ entity, files })
          result = await embeddedThumbnail(deployment)
        })

        it('should reject the deployment with the relative-path error', () => {
          expect(result.ok).toBe(false)
          expect(result.errors).toContain(
            `Scene thumbnail '${value}' must be a relative path to a file included in the deployment.`
          )
        })
      })
    })
  })

  describe('and the entity content is undefined', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: {
          ...VALID_SCENE_METADATA,
          display: { ...VALID_SCENE_METADATA.display, navmapThumbnail: 'thumbnail.png' }
        },
        content: undefined as unknown as ContentMapping[],
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await embeddedThumbnail(deployment)
    })

    it('should return a validation error instead of throwing', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and the metadata display block is undefined', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        type: EntityType.SCENE,
        metadata: { ...VALID_SCENE_METADATA, display: undefined },
        content,
        timestamp
      })
      const deployment = buildDeployment({ entity, files })
      result = await embeddedThumbnail(deployment)
    })

    it('should return ok without throwing', () => {
      expect(result.ok).toBe(true)
    })
  })
})
