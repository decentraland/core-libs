import { jest } from '@jest/globals'
import { compareStrings, sortKeys } from '../src/ADR32'
import type { EntityContentItemReference } from '../src/ADR32'

const RHS = -1
const LHS = 1
const EQ = 0

const compareStringsSuite: Array<[string, string, number]> = [
  ['a', 'a', EQ],
  ['a', '', LHS],
  ['', '', EQ],
  ['', 'a', RHS],
  ['a', 'b', RHS],
  ['b', 'b', EQ],
  ['b', 'a', LHS],
  ['aa', 'a', LHS],
  ['aa', 'ab', RHS],
  ['ab', 'ab', EQ],
  ['a', 'ab', RHS]
]

describe('sortKeys', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('when comparing strings', () => {
    compareStringsSuite.forEach(([left, right, expectedResult]) => {
      describe(`and the values are "${left}" and "${right}"`, () => {
        let a: string
        let b: string
        let result: number

        beforeEach(() => {
          a = left
          b = right
          result = expectedResult
        })

        it('should return the expected ordering result', () => {
          expect(compareStrings(a, b)).toEqual(result)
        })
      })
    })
  })

  describe('when sorting already ordered content references', () => {
    let references: EntityContentItemReference[]

    beforeEach(() => {
      references = [
        { file: 'a', hash: 'QmA' },
        { file: 'b', hash: 'QmB' },
        { file: 'c', hash: 'QmC' }
      ].sort(sortKeys)
    })

    it('should keep the references ordered by file', () => {
      expect(references.map(($) => $.file)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('when sorting reversed content references', () => {
    let references: EntityContentItemReference[]

    beforeEach(() => {
      references = [
        { file: 'c', hash: 'QmC' },
        { file: 'b', hash: 'QmB' },
        { file: 'a', hash: 'QmA' }
      ].sort(sortKeys)
    })

    it('should order the references by file', () => {
      expect(references.map(($) => $.file)).toEqual(['a', 'b', 'c'])
    })
  })

  describe('when sorting references with the same file and different hashes', () => {
    let references: EntityContentItemReference[]

    beforeEach(() => {
      references = [
        { file: 'a', hash: 'QmC' },
        { file: 'a', hash: 'QmB' },
        { file: 'a', hash: 'QmA' }
      ].sort(sortKeys)
    })

    it('should order the references by hash', () => {
      expect(references.map(($) => $.hash)).toEqual(['QmA', 'QmB', 'QmC'])
    })
  })

  describe('when both references are identical', () => {
    let left: EntityContentItemReference
    let right: EntityContentItemReference

    beforeEach(() => {
      left = { file: 'aaaa', hash: 'aaaa' }
      right = { file: 'aaaa', hash: 'aaaa' }
    })

    it('should return equal ordering', () => {
      expect(sortKeys(left, right)).toEqual(0)
    })
  })

  describe('when the left reference sorts before the right reference by hash', () => {
    let left: EntityContentItemReference
    let right: EntityContentItemReference

    beforeEach(() => {
      left = { file: 'aaaa', hash: 'aaaa' }
      right = { file: 'bbbb', hash: 'bbbb' }
    })

    it('should return right-side ordering', () => {
      expect(sortKeys(left, right)).toEqual(-1)
    })
  })

  describe('when the left reference sorts after the right reference by hash', () => {
    let left: EntityContentItemReference
    let right: EntityContentItemReference

    beforeEach(() => {
      left = { file: 'bbbb', hash: 'bbbb' }
      right = { file: 'aaaa', hash: 'aaaa' }
    })

    it('should return left-side ordering', () => {
      expect(sortKeys(left, right)).toEqual(1)
    })
  })

  describe('when references have the same file and the left hash sorts after the right hash', () => {
    let left: EntityContentItemReference
    let right: EntityContentItemReference

    beforeEach(() => {
      left = { file: 'aaaa', hash: 'bbbb' }
      right = { file: 'aaaa', hash: 'aaaa' }
    })

    it('should return left-side ordering', () => {
      expect(sortKeys(left, right)).toEqual(1)
    })
  })

  describe('when references have the same hash and the left file sorts after the right file', () => {
    let left: EntityContentItemReference
    let right: EntityContentItemReference

    beforeEach(() => {
      left = { file: 'aaab', hash: 'a' }
      right = { file: 'aaaa', hash: 'a' }
    })

    it('should return left-side ordering', () => {
      expect(sortKeys(left, right)).toEqual(1)
    })
  })
})
