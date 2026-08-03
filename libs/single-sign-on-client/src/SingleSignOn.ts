import type { AuthIdentity } from '@dcl/crypto'

function getKey(user: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(user)) {
    throw new Error(`User must be a valid ethereum address`)
  }

  return `single-sign-on-${user.toLowerCase()}`
}

export function getIdentity(user: string): AuthIdentity | null {
  const item = localStorage.getItem(getKey(user))
  if (!item) {
    return null
  }

  let identity: AuthIdentity
  try {
    identity = JSON.parse(item)
  } catch {
    clearIdentity(user)
    return null
  }

  identity.expiration = new Date(identity.expiration)

  if (identity.expiration.getTime() <= Date.now()) {
    clearIdentity(user)
    return null
  }

  return identity
}

export function storeIdentity(user: string, identity: AuthIdentity): void {
  const expiration = new Date(identity.expiration)
  if (expiration.getTime() > Date.now()) {
    localStorage.setItem(getKey(user), JSON.stringify(identity))
  }
}

export function clearIdentity(user: string): void {
  localStorage.removeItem(getKey(user))
}

export const localStorageGetIdentity = getIdentity
export const localStorageStoreIdentity = storeIdentity
export const localStorageClearIdentity = clearIdentity
