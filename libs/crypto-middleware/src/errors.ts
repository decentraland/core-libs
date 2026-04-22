export default class RequestError extends Error {
  constructor(
    message: string,
    public statusCode = 500
  ) {
    super(message)
    this.name = 'RequestError'
  }
}
