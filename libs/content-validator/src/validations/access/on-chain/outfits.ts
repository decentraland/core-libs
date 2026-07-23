import { createOutfitsPointerValidateFn } from '../../outfits'
import { validateAll } from '../../validations'
import { createOutfitsNamesOwnershipValidateFn, createOutfitsWearablesOwnershipValidateFn } from '../common/outfits'
import type { OnChainAccessCheckerComponents, ValidateFn } from '../../../types'

export function createOutfitsValidateFn(
  components: Pick<OnChainAccessCheckerComponents, 'client' | 'externalCalls'>
): ValidateFn {
  return validateAll(
    // Authorize the pointer (`<address>:outfits`) against the signer, mirroring profile/store
    createOutfitsPointerValidateFn(components),
    createOutfitsWearablesOwnershipValidateFn(components, components.client),
    createOutfitsNamesOwnershipValidateFn(components, components.client)
  )
}
