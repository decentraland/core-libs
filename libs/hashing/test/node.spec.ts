import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jest } from '@jest/globals'
import { hashV1WithLayout } from '../src/_layout'
import { hashV0, hashV1 } from '../src/node'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('hashing', () => {
  let bafyFixturePath: string
  let qmFixturePath: string
  let expectedBafyHash: string
  let expectedQmHash: string

  beforeEach(() => {
    bafyFixturePath = path.resolve(
      __dirname,
      'fixtures/hashes/bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5arzy'
    )
    qmFixturePath = path.resolve(__dirname, 'fixtures/hashes/QmSYpJEQLQc82USvtavzxEiBR57nyb5RdMzecBTR3Qg6qn')
    expectedBafyHash = 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5arzy'
    expectedQmHash = 'QmSYpJEQLQc82USvtavzxEiBR57nyb5RdMzecBTR3Qg6qn'
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when hashing CIDv1 content from a stream', () => {
    let stream: fs.ReadStream

    beforeEach(() => {
      stream = fs.createReadStream(bafyFixturePath)
    })

    afterEach(() => {
      stream.close()
    })

    it('should return the expected IPFS CIDv1', async () => {
      await expect(hashV1(stream as AsyncIterable<Uint8Array>)).resolves.toBe(expectedBafyHash)
    })
  })

  describe('when hashing legacy Qm content from a stream', () => {
    let stream: fs.ReadStream

    beforeEach(() => {
      stream = fs.createReadStream(qmFixturePath)
    })

    afterEach(() => {
      stream.close()
    })

    it('should return the expected legacy Qm hash', async () => {
      await expect(hashV0(stream as AsyncIterable<Uint8Array>)).resolves.toBe(expectedQmHash)
    })
  })

  describe('when hashing CIDv1 content from a buffer', () => {
    let content: Uint8Array

    beforeEach(() => {
      content = fs.readFileSync(bafyFixturePath)
    })

    it('should return the expected IPFS CIDv1', async () => {
      await expect(hashV1(content)).resolves.toBe(expectedBafyHash)
    })
  })

  describe('when hashing legacy Qm content from a buffer', () => {
    let content: Uint8Array

    beforeEach(() => {
      content = fs.readFileSync(qmFixturePath)
    })

    it('should return the expected legacy Qm hash', async () => {
      await expect(hashV0(content)).resolves.toBe(expectedQmHash)
    })
  })

  describe('when hashing content at the single-chunk boundary', () => {
    const SINGLE_CHUNK_MAX_BYTES = 262_144

    async function* toAsyncIterable(bytes: Uint8Array): AsyncIterable<Uint8Array> {
      yield bytes
    }

    function makeBuffer(size: number): Uint8Array {
      const bytes = new Uint8Array(size)
      for (let i = 0; i < size; i++) bytes[i] = i & 0xff
      return bytes
    }

    describe('and the buffer is exactly the max single-chunk size', () => {
      let content: Uint8Array

      beforeEach(() => {
        content = makeBuffer(SINGLE_CHUNK_MAX_BYTES)
      })

      it('should produce the same CID via the fast path and the importer path', async () => {
        const fastPathHash = await hashV1(content)
        const importerPathHash = await hashV1(toAsyncIterable(content))
        expect(fastPathHash).toBe(importerPathHash)
      })
    })

    describe('and the buffer is one byte above the max single-chunk size', () => {
      let content: Uint8Array

      beforeEach(() => {
        content = makeBuffer(SINGLE_CHUNK_MAX_BYTES + 1)
      })

      it('should produce the same CID via the Uint8Array path and the stream path', async () => {
        const bufferHash = await hashV1(content)
        const streamHash = await hashV1(toAsyncIterable(content))
        expect(bufferHash).toBe(streamHash)
      })
    })

    describe('and the buffer is small', () => {
      let content: Uint8Array

      beforeEach(() => {
        content = makeBuffer(1024)
      })

      it('should produce the same CID via the fast path and the importer path', async () => {
        const fastPathHash = await hashV1(content)
        const importerPathHash = await hashV1(toAsyncIterable(content))
        expect(fastPathHash).toBe(importerPathHash)
      })
    })
  })

  describe('when hashing empty content with CIDv1', () => {
    async function* emptyStream(): AsyncIterable<Uint8Array> {
      // yields nothing
    }

    it('should produce the same empty raw-leaf CID for an empty buffer and an empty stream', async () => {
      const bufferHash = await hashV1(new Uint8Array(0))
      const streamHash = await hashV1(emptyStream())
      expect(streamHash).toBe(bufferHash)
    })
  })

  describe('when hashing content that requires a balanced tree', () => {
    async function* deterministicStream(chunkCount: number, chunkSize: number): AsyncIterable<Uint8Array> {
      for (let i = 0; i < chunkCount; i++) {
        const chunk = new Uint8Array(chunkSize)
        chunk[0] = i & 0xff
        chunk[1] = (i >>> 8) & 0xff
        chunk[2] = (i >>> 16) & 0xff
        chunk[3] = (i >>> 24) & 0xff
        yield chunk
      }
    }

    describe('and the production layout (chunkSize=262144, maxChildrenPerNode=174) is used', () => {
      const CHUNK_SIZE_BYTES = 262_144
      const referenceHashes: Record<number, string> = {
        175: 'bafybeiaqquy5nm2mwvvewo2w3r4xtr3on2i4m2rco3ls7mpxp3y6rge6e4',
        200: 'bafybeie6nnyjfmveabfjzy63jdwp2lnsrhcx6vrzallhkadig6f4wcm3le',
        348: 'bafybeigrzojtcb5aov37ai75cllm4q6xwdnfddxjbujubmzrmtd2tvedc4',
        349: 'bafybeig3mxowaycxr2re73p2ysbii3ghp4phdm3gv43ieitbjxr52fyfza'
      }

      describe.each([
        [175, '174 children + 1 straggler'],
        [200, 'flat group + 26 stragglers'],
        [348, 'two full flat groups'],
        [349, 'two full flat groups + 1 straggler']
      ])('and the chunk count is %i (%s)', (chunkCount: number) => {
        it('should match the ipfs-unixfs-importer reference CID', async () => {
          await expect(hashV1(deterministicStream(chunkCount, CHUNK_SIZE_BYTES))).resolves.toBe(
            referenceHashes[chunkCount]
          )
        })
      })
    })

    describe('and a small fan-out layout (chunkSize=16, maxChildrenPerNode=3) is used', () => {
      const SMALL_CHUNK_SIZE = 16
      const SMALL_MAX_CHILDREN = 3
      const referenceHashes: Record<number, string> = {
        4: 'bafybeifv44dksyuml257iebtu2uxurpux7p4wggecgsv7lj5y6ipdllrhi',
        9: 'bafybeibcvqxqo6hstepsrwbbiwvzt64owc7277xg27xwwx2yxuurhxfw2y',
        10: 'bafybeigm7i2cuaaeqgtn4n5nogxsa2ui2f3crkzs33libqdc2amac2jpge',
        27: 'bafybeif6s5jougkfd3zkouc3sazfqpozva3iaf7mdbfjiq6sk5lkdfv4bm',
        28: 'bafybeiftg53eyneicsnoiai2xp5fd4up5po3nbxqp5how7jt3qfcwpqf4a',
        100: 'bafybeicad7rd3hqvnwsiqtbc6ofpaz2j6eeer5pcw44nl6tjadaame2n6y'
      }

      describe.each([
        [4, 'one full level-1 group + 1 straggler'],
        [9, 'three full level-1 groups (root cascades once)'],
        [10, '3^2 + 1 straggler promoted up two levels'],
        [27, '3^3 leaves (root cascades twice)'],
        [28, '3^3 + 1 straggler promoted up three levels'],
        [100, 'mixed three-level tree']
      ])('and the chunk count is %i (%s)', (chunkCount: number) => {
        it('should match the ipfs-unixfs-importer reference CID', async () => {
          await expect(
            hashV1WithLayout(deterministicStream(chunkCount, SMALL_CHUNK_SIZE), {
              chunkSize: SMALL_CHUNK_SIZE,
              maxChildrenPerNode: SMALL_MAX_CHILDREN
            })
          ).resolves.toBe(referenceHashes[chunkCount])
        })
      })
    })
  })

  describe('when hashing an unsupported value with CIDv1', () => {
    let content: unknown

    beforeEach(() => {
      content = 'invalid'
    })

    it('should reject with an invalid value error', async () => {
      await expect(hashV1(content as Uint8Array)).rejects.toThrow('Invalid value provided to hashV1')
    })
  })

  describe('when hashing an unsupported value with the legacy Qm hash', () => {
    let content: unknown

    beforeEach(() => {
      content = 'invalid'
    })

    it('should reject with an invalid value error', async () => {
      await expect(hashV0(content as Uint8Array)).rejects.toThrow('Invalid value provided to hashV0')
    })
  })
})
