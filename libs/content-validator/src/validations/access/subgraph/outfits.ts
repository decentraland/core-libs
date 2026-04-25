import { validateAll } from '../../validations'
import { createOutfitsNamesOwnershipValidateFn, createOutfitsWearablesOwnershipValidateFn } from '../common/outfits'
import type { SubgraphAccessCheckerComponents, ValidateFn } from '../../../types'

export function createOutfitsValidateFn(
  components: Pick<SubgraphAccessCheckerComponents, 'theGraphClient' | 'externalCalls'>
): ValidateFn {
  return validateAll(
    createOutfitsWearablesOwnershipValidateFn(components, components.theGraphClient),
    createOutfitsNamesOwnershipValidateFn(components, components.theGraphClient)
  )
}
