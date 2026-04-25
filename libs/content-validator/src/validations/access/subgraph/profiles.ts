import { createPointerCommonAccessValidateFn } from '../common/profile'
import type { SubgraphAccessCheckerComponents, ValidateFn } from '../../../types'

export function createProfileValidateFn(
  components: Pick<SubgraphAccessCheckerComponents, 'theGraphClient' | 'externalCalls'>
): ValidateFn {
  return createPointerCommonAccessValidateFn(components, components.theGraphClient, components.theGraphClient)
}
