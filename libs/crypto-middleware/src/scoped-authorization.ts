import { OPERATION_FORMAT, RESOURCE_FORMAT, SERVICE_FORMAT, isOperationGranted } from '@dcl/crypto'
import RequestError from './errors'
import type { DecentralandSignatureData } from './types'

/** Authorize a verified signature and expose the exact checked resource to its handler. */
export function authorizeVerifiedRequest<P extends Record<string, unknown>>(
  verification: DecentralandSignatureData<P>,
  options: { service?: string; operation?: string; resource?: string }
): DecentralandSignatureData<P> {
  if (verification.scope) {
    if (
      !options.service ||
      !SERVICE_FORMAT.test(options.service) ||
      options.service !== verification.scope.service ||
      !options.operation ||
      options.operation === '*' ||
      !OPERATION_FORMAT.test(options.operation)
    ) {
      throw new RequestError('This route does not declare a scoped operation', 403, 'SCOPED_OPERATION_REQUIRED')
    }
    if (!isOperationGranted(verification.scope, options.operation, options.resource)) {
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
