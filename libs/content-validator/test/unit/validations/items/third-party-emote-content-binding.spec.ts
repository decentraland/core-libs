import { generateTree } from '@dcl/content-hash-tree'
import { keccak256Hash } from '@dcl/hashing'
import { BodyShape, EmoteCategory, Locale } from '@dcl/schemas'
import type { Emote, ThirdPartyProps } from '@dcl/schemas'
import { emoteValidateFn } from '../../../../src/validations/items/emotes'
import { ADR_74_TIMESTAMP } from '../../../../src/validations/timestamps'
import { buildAuditInfo } from '../../../setup/deployments'
import { buildEmoteEntity } from '../../../setup/entity'
import type { DeploymentToValidate, ValidationResponse } from '../../../../src/types'

// A third-party emote's uploaded files must match the `content` map committed inside its merkle leaf.
const EMOTE_HASHING_KEYS = ['content', 'id', 'name', 'description', 'i18n', 'image', 'thumbnail', 'emoteDataADR74']

const officialPointer = 'urn:decentraland:amoy:collections-thirdparty:jean-pier:somecollection:someitemid'

// A legitimately-approved third-party emote whose committed content, uploaded files and representations
// all reference the same two files.
const committedContent: Record<string, string> = {
  file1: 'QmLegitModelHashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX1',
  file2: 'QmLegitModelHashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX2'
}

const baseEmoteMetadata = {
  id: officialPointer,
  name: 'name',
  description: 'some description',
  i18n: [{ code: Locale.EN, text: 'name' }],
  image: 'image.png',
  thumbnail: 'thumbnail.png',
  emoteDataADR74: {
    category: EmoteCategory.FUN,
    tags: ['tag1'],
    representations: [{ bodyShapes: [BodyShape.FEMALE], mainFile: 'file1', contents: ['file1', 'file2'] }],
    loop: true
  },
  content: committedContent
}

const entityHash = keccak256Hash(baseEmoteMetadata, EMOTE_HASHING_KEYS)
const tree = generateTree(['someOtherHash1', 'someOtherHash2', entityHash].sort())
const approvedEmoteMetadata = {
  ...baseEmoteMetadata,
  merkleProof: {
    index: tree.proofs[entityHash].index,
    proof: tree.proofs[entityHash].proof,
    hashingKeys: EMOTE_HASHING_KEYS,
    entityHash
  }
} as unknown as Emote & ThirdPartyProps

describe('when validating a third-party emote against its merkle-committed content', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and the uploaded files match the committed content', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEmoteEntity({
        pointers: [officialPointer],
        metadata: approvedEmoteMetadata,
        content: [
          { file: 'file1', hash: committedContent.file1 },
          { file: 'file2', hash: committedContent.file2 }
        ],
        timestamp: ADR_74_TIMESTAMP + 1
      })
      const deployment: DeploymentToValidate = { entity, files: new Map(), auditInfo: buildAuditInfo() }
      result = await emoteValidateFn(deployment)
    })

    it('should accept the legitimate third-party emote', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the uploaded files diverge from the committed content', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEmoteEntity({
        pointers: [officialPointer],
        metadata: approvedEmoteMetadata,
        // Same committed metadata (so the leaf hash is preserved) but attacker-controlled file hashes.
        content: [
          { file: 'file1', hash: 'QmAttackerControlledHashXXXXXXXXXXXXXXXXXXXXXX1' },
          { file: 'file2', hash: 'QmAttackerControlledHashXXXXXXXXXXXXXXXXXXXXXX2' }
        ],
        timestamp: ADR_74_TIMESTAMP + 1
      })
      const deployment: DeploymentToValidate = { entity, files: new Map(), auditInfo: buildAuditInfo() }
      result = await emoteValidateFn(deployment)
    })

    it('should reject because the uploaded files do not match the merkle-committed content', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'The content declared in the metadata does not match the files uploaded with the entity'
      )
    })
  })

  describe.each(['id', 'content', 'emoteDataADR74'])(
    'and the merkle proof hashing keys omit the %s field',
    (omittedKey) => {
      let result: ValidationResponse

      beforeEach(async () => {
        const metadataWithoutKey = {
          ...approvedEmoteMetadata,
          merkleProof: {
            ...approvedEmoteMetadata.merkleProof,
            hashingKeys: approvedEmoteMetadata.merkleProof.hashingKeys.filter((key) => key !== omittedKey)
          }
        } as unknown as Emote & ThirdPartyProps
        const entity = buildEmoteEntity({
          pointers: [officialPointer],
          metadata: metadataWithoutKey,
          content: [
            { file: 'file1', hash: committedContent.file1 },
            { file: 'file2', hash: committedContent.file2 }
          ],
          timestamp: ADR_74_TIMESTAMP + 1
        })
        const deployment: DeploymentToValidate = { entity, files: new Map(), auditInfo: buildAuditInfo() }
        result = await emoteValidateFn(deployment)
      })

      it('should reject because the proof does not commit the field', () => {
        expect(result.ok).toBe(false)
        expect(result.errors).toContain(`The third-party emote merkle proof must commit the '${omittedKey}' field`)
      })
    }
  )
})
