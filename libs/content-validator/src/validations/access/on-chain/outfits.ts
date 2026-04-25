import { validateAll } from '../../validations'
import { createOutfitsNamesOwnershipValidateFn, createOutfitsWearablesOwnershipValidateFn } from '../common/outfits'
import type { OnChainAccessCheckerComponents, ValidateFn } from '../../../types'

export function createOutfitsValidateFn(
  components: Pick<OnChainAccessCheckerComponents, 'client' | 'externalCalls'>
): ValidateFn {
  return validateAll(
    createOutfitsWearablesOwnershipValidateFn(components, components.client),
    createOutfitsNamesOwnershipValidateFn(components, components.client)
  )
}
