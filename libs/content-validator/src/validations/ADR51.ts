import type { EntityType, ValidateFunction } from '@dcl/schemas'
import { Emote, Outfits, Profile, Scene, Store, Wearable } from '@dcl/schemas'

interface Params {
  validate: ValidateFunction<Scene | Profile | Wearable | Store | Emote | Outfits>
  maxSizeInMB: number // in MB
  // Bounds the entity file itself, which `maxSizeInMB` never covers: that budget is spent on
  // `entity.content`, and the entity file is not a content mapping. Kept as a separate allowance
  // rather than folded into `maxSizeInMB` so metadata never competes with a deployment's assets.
  maxEntityFileSizeInKB: number // in KB
}

export const skinMaxSizeInMb = 9
export const thumbnailMaxSizeInMb = 1

export const entityParameters: Record<EntityType, Params> = {
  scene: {
    validate: Scene.validate,
    maxSizeInMB: 15,
    // Dominated by the content mapping, not the metadata: an estate spanning 10k parcels at the
    // 3000-file upload limit serialises to ~512 KB, of which ~3 KB is metadata.
    maxEntityFileSizeInKB: 2048
  },
  profile: {
    validate: Profile.validate,
    maxSizeInMB: 2,
    // Carries no content files since ADR-290, so this is pure metadata. A profile with 40 wearables
    // and 10 emotes is ~7 KB.
    maxEntityFileSizeInKB: 256
  },
  wearable: {
    validate: Wearable.validate,
    maxSizeInMB: 3,
    // Headroom for linked wearables, whose `mappings` are legitimately large: 5000 ranges is ~218 KB.
    maxEntityFileSizeInKB: 512
  },
  store: {
    validate: Store.validate,
    maxSizeInMB: 1,
    maxEntityFileSizeInKB: 128
  },
  emote: {
    validate: Emote.validate,
    maxSizeInMB: 3,
    maxEntityFileSizeInKB: 512
  },
  outfits: {
    validate: Outfits.validate,
    maxSizeInMB: 1,
    // Bounded shape: at most 10 slots, each a wearable list. Ten full slots is ~28 KB.
    maxEntityFileSizeInKB: 256
  }
}
