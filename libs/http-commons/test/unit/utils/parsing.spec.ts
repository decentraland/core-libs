import { PayloadTooLargeError } from '../../../src/errors'
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

  describe('and the content-length header exceeds the maximum allowed size', () => {
    let request: Request
    let maxBytes: number

    beforeEach(() => {
      maxBytes = 10
      request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-length': String(maxBytes + 1)
        },
        body: JSON.stringify({ foo: 'bar' })
      })
    })

    it('should reject with a PayloadTooLargeError', async () => {
      await expect(parseJson(request, maxBytes)).rejects.toThrow(PayloadTooLargeError)
    })

    it('should not read the request body', async () => {
      const jsonSpy = jest.spyOn(request, 'json')

      await expect(parseJson(request, maxBytes)).rejects.toThrow(PayloadTooLargeError)
      expect(jsonSpy).not.toHaveBeenCalled()
    })
  })

  describe('and the content-length header is within the maximum allowed size', () => {
    let request: Request

    beforeEach(() => {
      const body = JSON.stringify({ foo: 'bar' })
      request = new Request('http://localhost', {
        method: 'POST',
        headers: {
          'content-length': String(Buffer.byteLength(body))
        },
        body
      })
    })

    it('should resolve with the parsed object', async () => {
      await expect(parseJson(request, 10 * 1024 * 1024)).resolves.toEqual({ foo: 'bar' })
    })
  })
})
