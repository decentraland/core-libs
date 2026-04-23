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
