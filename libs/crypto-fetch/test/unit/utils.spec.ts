import { getImplementation } from '../../src/utils'

describe('getImplementation', () => {
  describe('when the key is provided in options', () => {
    it('should return the implementation from options', () => {
      const MathImpl = jest.fn() as unknown as typeof Math
      expect(getImplementation({ Math: MathImpl }, 'Math')).toBe(MathImpl)
    })
  })

  describe('when the key is not provided in options', () => {
    it('should fall back to the global implementation', () => {
      expect(getImplementation({}, 'Math')).toBe(Math)
    })
  })

  describe('when the key is not provided in options and is not defined globally', () => {
    it('should throw a ReferenceError', () => {
      expect(() => getImplementation({}, 'NotAGlobal' as keyof typeof globalThis)).toThrow(
        new ReferenceError('"NotAGlobal" is not defined')
      )
    })
  })
})
