import {
  HTTPResponseError,
  InvalidRequestError,
  NotAuthorizedError,
  NotFoundError,
  PayloadTooLargeError
} from '../../src/errors'

describe('when creating an InvalidRequestError', () => {
  let error: InvalidRequestError

  beforeEach(() => {
    error = new InvalidRequestError('invalid request')
  })

  it('should set the name to the class name', () => {
    expect(error.name).toBe('InvalidRequestError')
  })

  it('should preserve the provided message', () => {
    expect(error.message).toBe('invalid request')
  })
})

describe('when creating a NotFoundError', () => {
  let error: NotFoundError

  beforeEach(() => {
    error = new NotFoundError('not found')
  })

  it('should set the name to the class name', () => {
    expect(error.name).toBe('NotFoundError')
  })

  it('should preserve the provided message', () => {
    expect(error.message).toBe('not found')
  })
})

describe('when creating a NotAuthorizedError', () => {
  let error: NotAuthorizedError

  beforeEach(() => {
    error = new NotAuthorizedError('not authorized')
  })

  it('should set the name to the class name', () => {
    expect(error.name).toBe('NotAuthorizedError')
  })

  it('should preserve the provided message', () => {
    expect(error.message).toBe('not authorized')
  })
})

describe('when creating a PayloadTooLargeError', () => {
  let error: PayloadTooLargeError

  beforeEach(() => {
    error = new PayloadTooLargeError('payload too large')
  })

  it('should set the name to the class name', () => {
    expect(error.name).toBe('PayloadTooLargeError')
  })

  it('should preserve the provided message', () => {
    expect(error.message).toBe('payload too large')
  })
})

describe('when creating an HTTPResponseError', () => {
  let error: HTTPResponseError
  let response: Response

  beforeEach(() => {
    response = new Response('body', { status: 500, statusText: 'Internal Server Error' })
    error = new HTTPResponseError(response)
  })

  it('should set the name to the class name', () => {
    expect(error.name).toBe('HTTPResponseError')
  })
})
