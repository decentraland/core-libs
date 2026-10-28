import { RESOURCE_FORMAT, authorizeScope } from '@dcl/crypto'
import RequestError from './errors'
import type { DecentralandSignatureData } from './types'

/** Authorize a verified signature and expose the exact checked resource to its handler. */
export function authorizeVerifiedRequest<P extends Record<string, unknown>>(
  verification: DecentralandSignatureData<P>,
  options: { service?: string; operation?: string; resource?: string }
): DecentralandSignatureData<P> {
  if (verification.scope) {
    const result = authorizeScope(verification.scope, options)
    if (!result.ok) {
      if (result.reason === 'operation-required') {
        throw new RequestError('This route does not declare a scoped operation', 403, 'SCOPED_OPERATION_REQUIRED')
      }
      if (result.reason === 'resource-invalid') {
        throw new RequestError('Cannot resolve the request resource', 403, 'SCOPED_RESOURCE_REQUIRED')
      }
      throw new RequestError(`The scoped login does not grant "${options.operation}"`, 403, 'SCOPED_OPERATION_DENIED')
    }
  }
  if (options.resource !== undefined) {
    if (typeof options.resource !== 'string' || !RESOURCE_FORMAT.test(options.resource)) {
      throw new RequestError('Cannot resolve the request resource', 403, 'SCOPED_RESOURCE_REQUIRED')
    }
    Object.defineProperty(verification, 'resource', { value: options.resource, enumerable: true })
  }
  return verification
}
