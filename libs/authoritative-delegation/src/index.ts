import { verifyDelegation } from './verify'
import type { DelegationResult, DelegationTarget } from './verify'

export {
  DELEGATION_PREFIX,
  CLAIM_FIELDS,
  EPHEMERAL_FORMAT,
  WORLD_FORMAT,
  SCENE_ID_FORMAT,
  PARCEL_FORMAT,
  buildClaimPayload,
  parseClaim
} from './claim'
export type { ClaimInput, ParsedClaim } from './claim'
export { SCOPE_HEADER, MAX_SCOPE_HEADER_LENGTH, verifyDelegation } from './verify'
export type { DelegationResult, DelegationTarget } from './verify'

// Names world-storage-service used before the extraction. Kept so its import
// swap is mechanical; new consumers use the unprefixed names.
/** @deprecated Use `verifyDelegation`. */
export const verifyStorageDelegation = verifyDelegation
/** @deprecated Use `DelegationResult`. */
export type StorageDelegationResult = DelegationResult
/** @deprecated Use `DelegationTarget`. */
export type StorageDelegationTarget = DelegationTarget
