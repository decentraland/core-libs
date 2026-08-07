import type { IHttpServerComponent } from '@dcl/core-commons'
import { InvalidRequestError, PayloadTooLargeError } from '../errors'

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024

export async function parseJson<T>(
  request: IHttpServerComponent.IRequest,
  maxBytes: number = DEFAULT_MAX_BYTES
): Promise<T> {
  // NOTE: This only rejects requests that honestly advertise an over-limit body via
  // the content-length header. A missing or spoofed content-length is NOT caught here,
  // so an upstream proxy body-size limit is still required to fully protect against OOM.
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const parsedContentLength = Number(contentLength)
    if (!isNaN(parsedContentLength) && parsedContentLength > maxBytes) {
      throw new PayloadTooLargeError(`Request body exceeds the maximum allowed size of ${maxBytes} bytes`)
    }
  }

  try {
    return (await request.json()) as T
  } catch {
    throw new InvalidRequestError('Invalid body')
  }
}
