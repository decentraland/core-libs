export { DELEGATION_PREFIX, CLAIM_FIELDS, buildClaimPayload, parseClaim } from './claim'
export type { ClaimInput, ParsedClaim } from './claim'
export { SCOPE_HEADER, MAX_SCOPE_HEADER_LENGTH, verifyDelegation } from './verify'
export type { DelegationResult, DelegationTarget } from './verify'

// Names world-storage-service used before the extraction. Kept so its import
// swap is mechanical; new consumers use the unprefixed names.
export { verifyDelegation as verifyStorageDelegation } from './verify'
export type { DelegationResult as StorageDelegationResult, DelegationTarget as StorageDelegationTarget } from './verify'
