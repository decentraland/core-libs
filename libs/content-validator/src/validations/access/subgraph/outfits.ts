import { createOutfitsPointerValidateFn } from '../../outfits'
import { validateAll } from '../../validations'
import { createOutfitsNamesOwnershipValidateFn, createOutfitsWearablesOwnershipValidateFn } from '../common/outfits'
import type { SubgraphAccessCheckerComponents, ValidateFn } from '../../../types'

export function createOutfitsValidateFn(
  components: Pick<SubgraphAccessCheckerComponents, 'theGraphClient' | 'externalCalls'>
): ValidateFn {
  return validateAll(
    // Authorize the pointer (`<address>:outfits`) against the signer, mirroring profile/store
    createOutfitsPointerValidateFn(components),
    createOutfitsWearablesOwnershipValidateFn(components, components.theGraphClient),
    createOutfitsNamesOwnershipValidateFn(components, components.theGraphClient)
  )
}
