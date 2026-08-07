export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class NotAuthorizedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export class HTTPResponseError extends Error {
  constructor(public response: Response) {
    super(`HTTP Error Response: ${response.status} ${response.statusText} for URL ${response.url}`)
    this.name = new.target.name
    Error.captureStackTrace(this, this.constructor)
  }
}
