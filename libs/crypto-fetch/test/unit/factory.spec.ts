import { signedFetchFactory, signedHeaderFactory } from '../../src/factory'

describe('factory barrel', () => {
  describe('when imported from src/factory', () => {
    it('should re-export signedFetchFactory as a function', () => {
      expect(typeof signedFetchFactory).toBe('function')
    })

    it('should re-export signedHeaderFactory as a function', () => {
      expect(typeof signedHeaderFactory).toBe('function')
    })
  })
})
