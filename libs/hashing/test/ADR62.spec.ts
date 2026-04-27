import { jest } from '@jest/globals'
import { keccak256Hash } from '../src/ADR62'

type WearableMetadata = Record<string, unknown> & {
  merkleProof: {
    hashingKeys: string[]
  }
}

describe('ADR62', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when hashing metadata with a merkle proof', () => {
    let metadata: WearableMetadata

    beforeEach(() => {
      metadata = {
        id: 'urn:decentraland:off-chain:base-avatars:aviatorstyle',
        name: 'Aviator Style',
        description: 'aDescription',
        image: 'image.png',
        thumbnail: 'thumbnail.png',
        data: {
          tags: ['male', 'man', 'base-wearable'],
          category: 'eyewear',
          replaces: [],
          hides: [],
          representations: [
            {
              bodyShapes: ['urn:decentraland:off-chain:base-avatars:BaseMale'],
              mainFile: 'M_Eyewear_AviatorStyle.glb',
              overrideReplaces: [],
              overrideHides: [],
              contents: ['M_Eyewear_AviatorStyle.glb']
            }
          ]
        },
        i18n: [{ code: 'en', text: 'Aviator Style' }],
        createdAt: 1646935739,
        updatedAt: 1646935739,
        metrics: {
          triangles: 0,
          materials: 0,
          meshes: 0,
          bodies: 0,
          entities: 0,
          textures: 0
        },
        content: {
          'some-file.glb': '3999dc565303be392b94568fe252fd09482c2329e3381b66d730f870cb6c2afa',
          'thumbnail.png': 'b9b9563ea35e1f995e272e9c699326ac61b94cfe46dc4f49b5215c94d3209854'
        },
        merkleProof: {
          hashingKeys: [
            'id',
            'name',
            'description',
            'image',
            'thumbnail',
            'data',
            'i18n',
            'createdAt',
            'updatedAt',
            'metrics',
            'content'
          ]
        }
      }
    })

    it('should return the expected metadata hash', () => {
      expect(keccak256Hash(metadata, metadata.merkleProof.hashingKeys)).toBe(
        '8282d378bafea28952d4bcce9b2bc1567ed2dda20eba629c8030752dd8169c43'
      )
    })
  })

  describe('when hashing metadata without matching keys', () => {
    let metadata: Record<string, unknown>
    let keys: string[]

    beforeEach(() => {
      metadata = {
        someField: 'someValue'
      }
      keys = ['unknownField']
    })

    it('should return the same hash as empty metadata', () => {
      expect(keccak256Hash(metadata, keys)).toBe('b48d38f93eaa084033fc5970bf96e559c33c4cdc07d889ab00b4d63f9590739d')
    })
  })

  describe('when hashing metadata with different keys', () => {
    let metadata: Record<string, unknown>
    let fieldAKeys: string[]
    let fieldBKeys: string[]

    beforeEach(() => {
      metadata = {
        fieldA: 'fieldA',
        fieldB: 'fieldB'
      }
      fieldAKeys = ['fieldA']
      fieldBKeys = ['fieldB']
    })

    it('should return different hashes', () => {
      expect(keccak256Hash(metadata, fieldAKeys)).not.toBe(keccak256Hash(metadata, fieldBKeys))
    })
  })

  describe('when hashing metadata with the same keys in a different order', () => {
    let metadata: Record<string, unknown>
    let keys: string[]
    let reversedKeys: string[]

    beforeEach(() => {
      metadata = {
        fieldA: 'fieldA',
        fieldB: 'fieldB'
      }
      keys = ['fieldA', 'fieldB']
      reversedKeys = ['fieldB', 'fieldA']
    })

    it('should return different hashes', () => {
      expect(keccak256Hash(metadata, keys)).not.toBe(keccak256Hash(metadata, reversedKeys))
    })
  })
})
