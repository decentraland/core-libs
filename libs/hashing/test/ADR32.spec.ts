import { calculateMultipleHashesADR32, calculateMultipleHashesADR32LegacyQmHash } from '../dist/ADR32'
import type { EntityContentItemReference } from '../src/ADR32'

describe('ADR32', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when hashing one content file with CIDv1', () => {
    let files: EntityContentItemReference[]

    beforeEach(() => {
      files = [{ file: 'a.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5arzy' }]
    })

    it('should return the deterministic CIDv1 hash', async () => {
      await expect(calculateMultipleHashesADR32(files)).resolves.toMatchObject({
        hash: 'bafkreigwbjbqaaf63q2cnbrqebctyo3a5y6oxos47usvexhvzajkoczspa'
      })
    })
  })

  describe('when hashing multiple content files with CIDv1', () => {
    let files: EntityContentItemReference[]

    beforeEach(() => {
      files = [
        { file: 'a.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5arzy' },
        { file: 'a/b.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5asd' }
      ]
    })

    it('should return the deterministic CIDv1 hash', async () => {
      await expect(calculateMultipleHashesADR32(files)).resolves.toMatchObject({
        hash: 'bafkreih5bj5fxz72bgvhlqq35teesr75wysn2qcjayyi7kehdcyeiosgdi'
      })
    })
  })

  describe('when hashing multiple content files and metadata with CIDv1', () => {
    let files: EntityContentItemReference[]
    let metadata: Record<string, string>

    beforeEach(() => {
      files = [
        { file: 'a.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5arzy' },
        { file: 'a/b.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5asd' }
      ]
      metadata = { key: 'value' }
    })

    it('should include metadata in the deterministic CIDv1 hash', async () => {
      await expect(calculateMultipleHashesADR32(files, metadata)).resolves.toMatchObject({
        hash: 'bafkreieusocjbdoxg5cdqtysltk353l3mtmzvtyhza6zxvwfjsfjrcm2ze'
      })
    })
  })

  describe('when hashing multiple content files and metadata with the legacy Qm hash', () => {
    let files: EntityContentItemReference[]
    let metadata: Record<string, string>

    beforeEach(() => {
      files = [
        { file: 'a.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5arzy' },
        { file: 'a/b.png', hash: 'bafybeibdik2ihfpcdi7aaaguptwcoc5msav7uhn5hu54xlq2pdwkh5asd' }
      ]
      metadata = { key: 'value' }
    })

    it('should include metadata in the deterministic Qm hash', async () => {
      await expect(calculateMultipleHashesADR32LegacyQmHash(files, metadata)).resolves.toMatchObject({
        hash: 'QmYLdWnSPor5Ycr6MdaaqwsbTLsnvRtw8MPZ5oitMKoztg'
      })
    })
  })
})
