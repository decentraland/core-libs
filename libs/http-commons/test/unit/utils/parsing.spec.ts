import { parseJson } from '../../../src/utils'

describe('when parsing a request', () => {
  it('should parse json correctly', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ foo: 'bar' })
    })

    await expect(parseJson(request)).resolves.toEqual({ foo: 'bar' })
  })

  it('should parse json correctly', async () => {
    const request = new Request('http://localhost', {
      method: 'POST',
      body: 'xx { xxx } xx'
    })

    await expect(parseJson(request)).rejects.toThrow('Invalid body')
  })
})
