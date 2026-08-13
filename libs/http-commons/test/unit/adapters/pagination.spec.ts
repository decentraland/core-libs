import { URLSearchParams } from 'url'
import { getPaginationParams } from '../../../src/adapters'

describe('when getting the pagination params', () => {
  describe('and the offset is greater than the max offset', () => {
    it('should cap it, since the value reaches the database verbatim', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: '1000000' }))).toEqual({
        limit: 100,
        offset: 100000
      })
    })
  })

  describe('and the offset is beyond the range of a bigint', () => {
    it('should cap it rather than let the query fail with 22003', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: '9223372036854775808' }))).toEqual({
        limit: 100,
        offset: 100000
      })
    })
  })

  describe('and the offset is at the max offset', () => {
    it('should return it unchanged', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: '100000' }))).toEqual({
        limit: 100,
        offset: 100000
      })
    })
  })

  describe('and the offset is a value a client would actually send', () => {
    it('should return it unchanged', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: '250' }))).toEqual({
        limit: 100,
        offset: 250
      })
    })
  })

  describe('and the limit is greater than the max limit', () => {
    it('should return the default limit', () => {
      expect(getPaginationParams(new URLSearchParams({ limit: '200' }))).toEqual({
        limit: 100,
        offset: 0
      })
    })
  })

  describe('and the limit is set to a negative number', () => {
    it('should return the default limit', () => {
      expect(getPaginationParams(new URLSearchParams({ limit: '-100' }))).toEqual({
        limit: 100,
        offset: 0
      })
    })
  })

  describe("and the limit is set to a a value that can't be parsed as a number", () => {
    it('should return the default limit', () => {
      expect(getPaginationParams(new URLSearchParams({ limit: 'notAnInteger' }))).toEqual({
        limit: 100,
        offset: 0
      })
    })
  })

  describe('and the limit is set to a valid value', () => {
    it('should return the value as the limit', () => {
      expect(getPaginationParams(new URLSearchParams({ limit: '10' }))).toEqual({
        limit: 10,
        offset: 0
      })
    })
  })

  describe('and the offset is set to a valid value', () => {
    it('should return the value as the offset', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: '20' }))).toEqual({
        limit: 100,
        offset: 20
      })
    })
  })

  describe('and the offset is set to a negative number', () => {
    it('should default the offset to 0', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: '-5' }))).toEqual({
        limit: 100,
        offset: 0
      })
    })
  })

  describe("and the offset can't be parsed as a number", () => {
    it('should default the offset to 0', () => {
      expect(getPaginationParams(new URLSearchParams({ offset: 'notAnInteger' }))).toEqual({
        limit: 100,
        offset: 0
      })
    })
  })

  describe('and both limit and offset are missing', () => {
    it('should return the defaults', () => {
      expect(getPaginationParams(new URLSearchParams())).toEqual({
        limit: 100,
        offset: 0
      })
    })
  })

  describe('and both limit and offset are valid', () => {
    it('should return the provided values', () => {
      expect(getPaginationParams(new URLSearchParams({ limit: '25', offset: '30' }))).toEqual({
        limit: 25,
        offset: 30
      })
    })
  })
})
