import { OK } from './types'
import { createStagingValidateFns, createValidateFns } from './validations'
import type { ContentValidatorComponents, StagingValidatorOptions, ValidateFn } from './types'

export * from './types'
export * from './validations'
export { readImageMetadata } from './image-metadata'
export type { ImageFormat, ImageMetadata } from './image-metadata'

// Runs the given validations in order and returns the first failure (or OK). Short-circuits like the
// deployment pipeline expects, and logs the failing validation's errors under `loggerName` (so, e.g.,
// the staging validator's failures are distinguishable from the full validator's in the logs).
function runSequentially(
  components: ContentValidatorComponents,
  validateFns: ValidateFn[],
  loggerName: string
): ValidateFn {
  const logs = components.logs.getLogger(loggerName)
  return async function validateFn(deployment) {
    for (const validate of validateFns) {
      const result = await validate(deployment)
      if (!result.ok) {
        logs.debug(`Validation failed:\n${result.errors?.join('\n')}`)
        return result
      }
    }
    return OK
  }
}

/**
 * Creates a validator instance with given external calls.
 * @public
 */
export const createValidator = (components: ContentValidatorComponents): ValidateFn =>
  runSequentially(components, [...createValidateFns(components), components.accessValidateFn], 'ContentValidator')

/**
 * Creates a validator for a partial (staging) deployment — the content-independent subset that can be
 * checked before all of an entity's content is present (see {@link createStagingValidateFns}). Lets a
 * multi-request upload flow validate staging requests without composing individual validations by hand.
 *
 * The access check is included only when `options.includeAccessCheck` is set: it is the expensive
 * on-chain/subgraph call, and a caller may skip it on a trusted resume request (the full
 * {@link createValidator} still runs it at finalize).
 * @public
 */
export const createStagingValidator = (
  components: ContentValidatorComponents,
  options: StagingValidatorOptions = {}
): ValidateFn =>
  runSequentially(
    components,
    [...createStagingValidateFns(components), ...(options.includeAccessCheck ? [components.accessValidateFn] : [])],
    'ContentValidator:staging'
  )
