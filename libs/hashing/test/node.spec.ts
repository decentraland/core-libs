import fs from 'node:fs'
import path from 'node:path'
import { hashV0, hashV1 } from '../dist/node'

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

  describe('when hashing an empty stream with CIDv1', () => {
    async function* emptyStream(): AsyncIterable<Uint8Array> {
      // yields nothing
    }

    it('should reject with a no-content error', async () => {
      await expect(hashV1(emptyStream())).rejects.toThrow('hashV1: no content was provided')
    })
  })

  describe('when hashing content that exceeds the flat-parent limit', () => {
    const CHUNK_SIZE_BYTES = 262_144
    const MAX_FLAT_CHILDREN = 174

    async function* tooManyChunks(): AsyncIterable<Uint8Array> {
      const chunk = new Uint8Array(CHUNK_SIZE_BYTES)
      for (let i = 0; i < MAX_FLAT_CHILDREN + 1; i++) {
        yield chunk
      }
    }

    it('should reject with a flat-parent-limit error', async () => {
      await expect(hashV1(tooManyChunks())).rejects.toThrow(/exceeds flat-parent limit of 174 chunks/)
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
