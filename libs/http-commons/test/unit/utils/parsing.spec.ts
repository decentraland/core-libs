import { parseJson } from '../../../src/utils'

describe('when parsing a request', () => {
  describe('and the body is valid JSON', () => {
    it('should resolve with the parsed object', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ foo: 'bar' })
      })

      await expect(parseJson(request)).resolves.toEqual({ foo: 'bar' })
    })
  })

  describe('and the body is not valid JSON', () => {
    it('should reject with an "Invalid body" error', async () => {
      const request = new Request('http://localhost', {
        method: 'POST',
        body: 'xx { xxx } xx'
      })

      await expect(parseJson(request)).rejects.toThrow('Invalid body')
    })
  })
})
