import { EntityType } from '@dcl/schemas'
import { createV1andV2collectionAssetValidateFn } from './collection-asset'
import { createOutfitsValidateFn } from './outfits'
import { createProfileValidateFn } from './profiles'
import { createSceneValidateFn } from './scenes'
import { createThirdPartyAssetValidateFn } from './third-party-asset'
import { createEmoteValidateFn, createWearableValidateFn } from '../common/items'
import { createStoreValidateFn } from '../common/stores'
import type { SubgraphAccessCheckerComponents, ValidateFn } from '../../../types'

export function createSubgraphAccessCheckValidateFns(
  components: SubgraphAccessCheckerComponents
): Record<EntityType, ValidateFn> {
  const v1andV2collectionAssetValidateFn = createV1andV2collectionAssetValidateFn(components)
  const thirdPartyAssetValidateFn = createThirdPartyAssetValidateFn(components)
  return {
    [EntityType.PROFILE]: createProfileValidateFn(components),
    [EntityType.SCENE]: createSceneValidateFn(components),
    [EntityType.WEARABLE]: createWearableValidateFn(
      components,
      v1andV2collectionAssetValidateFn,
      thirdPartyAssetValidateFn
    ),
    [EntityType.STORE]: createStoreValidateFn(components),
    [EntityType.EMOTE]: createEmoteValidateFn(components, v1andV2collectionAssetValidateFn, thirdPartyAssetValidateFn),
    [EntityType.OUTFITS]: createOutfitsValidateFn(components)
  }
}
