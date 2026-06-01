import type { AuthIdentity } from '@dcl/crypto'

// Gets the key where the identity of the user is stored in local storage.
function getKey(user: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(user)) {
    throw new Error(`User must be a valid ethereum address`)
  }

  return `single-sign-on-${user.toLowerCase()}`
}

// Gets the identity of the given user from local storage.
// Does some extra operations on the obtained value to make it more reliable.
export function getIdentity(user: string): AuthIdentity | null {
  const item = localStorage.getItem(getKey(user))
  if (!item) {
    return null
  }

  let identity: AuthIdentity
  try {
    // If the item is not a valid JSON, we remove it.
    identity = JSON.parse(item)
  } catch (e) {
    clearIdentity(user)
    return null
  }

  // The expiration is parsed as a string, so we need to convert it to a Date.
  identity.expiration = new Date(identity.expiration)

  // If expiration is in the past, we remove the identity.
  if (identity.expiration.getTime() <= Date.now()) {
    clearIdentity(user)
    return null
  }

  // Everything is fine, we return the identity.
  return identity
}

// Stores the identity of the given user in local storage (if it is not expired).
export function storeIdentity(user: string, identity: AuthIdentity): void {
  const expiration = new Date(identity.expiration)
  if (expiration.getTime() > Date.now()) {
    localStorage.setItem(getKey(user), JSON.stringify(identity))
  }
}

// Clears the identity of the given user from local storage.
export function clearIdentity(user: string): void {
  localStorage.removeItem(getKey(user))
}

// Back-compat aliases for the `localStorage*`-prefixed names used by the 0.1.x
// line. These are what every current consumer imports; keeping them lets the
// iframe removal land as a drop-in upgrade. Prefer the unprefixed names above.
export const localStorageGetIdentity = getIdentity
export const localStorageStoreIdentity = storeIdentity
export const localStorageClearIdentity = clearIdentity
