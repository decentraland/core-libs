import * as nodeFetch from 'node-fetch'

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotAuthorizedError extends Error {
  constructor(message: string) {
    super(message)
    Error.captureStackTrace(this, this.constructor)
  }
}

export class HTTPResponseError extends Error {
  constructor(public response: nodeFetch.Response) {
    super(`HTTP Error Response: ${response.status} ${response.statusText} for URL ${response.url}`)
  }
}
