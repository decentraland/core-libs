import { createPointerCommonAccessValidateFn } from '../common/profile'
import type { OnChainAccessCheckerComponents, ValidateFn } from '../../../types'

export function createProfileValidateFn(
  components: Pick<OnChainAccessCheckerComponents, 'client' | 'externalCalls'>
): ValidateFn {
  return createPointerCommonAccessValidateFn(components, components.client, components.client)
}
