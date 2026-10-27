export default class RequestError extends Error {
  constructor(
    message: string,
    public statusCode = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'RequestError'
  }
}
