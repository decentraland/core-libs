import type { AuthIdentity } from '@dcl/crypto'
import {
  clearIdentity,
  getIdentity,
  localStorageClearIdentity,
  localStorageGetIdentity,
  localStorageStoreIdentity,
  storeIdentity
} from '../../src/SingleSignOn'

const VALID_USER = '0x1234567890abcdef1234567890abcdef12345678'
const USER_KEY = `single-sign-on-${VALID_USER.toLowerCase()}`

function buildIdentity(expiration: Date): AuthIdentity {
  return {
    ephemeralIdentity: {
      address: '0xabcabcabcabcabcabcabcabcabcabcabcabcabca',
      privateKey: '0xprivate',
      publicKey: '0xpublic'
    },
    expiration,
    authChain: []
  }
}

afterEach(() => {
  localStorage.clear()
})

describe('getIdentity', () => {
  describe('when the user is not a valid ethereum address', () => {
    it('should throw an error indicating the user must be a valid ethereum address', () => {
      expect(() => getIdentity('not-an-address')).toThrow('User must be a valid ethereum address')
    })
  })

  describe('when there is no identity stored for the user', () => {
    it('should return null', () => {
      expect(getIdentity(VALID_USER)).toBeNull()
    })
  })

  describe('when the stored value is not valid JSON', () => {
    beforeEach(() => {
      localStorage.setItem(USER_KEY, 'not-json')
    })

    it('should return null', () => {
      expect(getIdentity(VALID_USER)).toBeNull()
    })

    it('should remove the invalid value from local storage', () => {
      getIdentity(VALID_USER)
      expect(localStorage.getItem(USER_KEY)).toBeNull()
    })
  })

  describe('when the stored value is valid JSON but not a well-formed identity', () => {
    const malformedValues: Record<string, string> = {
      null: 'null',
      'a number': '123',
      'a string': '"hello"',
      'a boolean': 'true',
      'an empty object': '{}'
    }

    Object.entries(malformedValues).forEach(([description, storedValue]) => {
      describe(`and the stored value is ${description}`, () => {
        beforeEach(() => {
          localStorage.setItem(USER_KEY, storedValue)
        })

        it('should return null without throwing', () => {
          expect(() => getIdentity(VALID_USER)).not.toThrow()
          expect(getIdentity(VALID_USER)).toBeNull()
        })

        it('should remove the malformed value from local storage', () => {
          getIdentity(VALID_USER)
          expect(localStorage.getItem(USER_KEY)).toBeNull()
        })
      })
    })
  })

  describe('when the stored identity is expired', () => {
    beforeEach(() => {
      localStorage.setItem(USER_KEY, JSON.stringify(buildIdentity(new Date(Date.now() - 60_000))))
    })

    it('should return null', () => {
      expect(getIdentity(VALID_USER)).toBeNull()
    })

    it('should remove the expired identity from local storage', () => {
      getIdentity(VALID_USER)
      expect(localStorage.getItem(USER_KEY)).toBeNull()
    })
  })

  describe('when the stored identity is valid and not expired', () => {
    let expiration: Date

    beforeEach(() => {
      expiration = new Date(Date.now() + 60_000)
      localStorage.setItem(USER_KEY, JSON.stringify(buildIdentity(expiration)))
    })

    it('should return the identity with the expiration parsed as a Date', () => {
      const result = getIdentity(VALID_USER)
      expect(result?.expiration).toBeInstanceOf(Date)
      expect(result?.expiration.getTime()).toEqual(expiration.getTime())
    })
  })
})

describe('storeIdentity', () => {
  let identity: AuthIdentity

  describe('when the user is not a valid ethereum address', () => {
    beforeEach(() => {
      identity = buildIdentity(new Date(Date.now() + 60_000))
    })

    it('should throw an error indicating the user must be a valid ethereum address', () => {
      expect(() => storeIdentity('not-an-address', identity)).toThrow('User must be a valid ethereum address')
    })
  })

  describe('when the identity is not expired', () => {
    beforeEach(() => {
      identity = buildIdentity(new Date(Date.now() + 60_000))
      storeIdentity(VALID_USER, identity)
    })

    it('should persist the identity in local storage under the user key', () => {
      expect(localStorage.getItem(USER_KEY)).toEqual(JSON.stringify(identity))
    })
  })

  describe('when the identity is already expired', () => {
    beforeEach(() => {
      identity = buildIdentity(new Date(Date.now() - 60_000))
      storeIdentity(VALID_USER, identity)
    })

    it('should not persist the identity in local storage', () => {
      expect(localStorage.getItem(USER_KEY)).toBeNull()
    })
  })
})

describe('localStorage-prefixed back-compat aliases', () => {
  describe('when imported alongside the canonical functions', () => {
    it('should expose localStorageGetIdentity as the same function as getIdentity', () => {
      expect(localStorageGetIdentity).toBe(getIdentity)
    })

    it('should expose localStorageStoreIdentity as the same function as storeIdentity', () => {
      expect(localStorageStoreIdentity).toBe(storeIdentity)
    })

    it('should expose localStorageClearIdentity as the same function as clearIdentity', () => {
      expect(localStorageClearIdentity).toBe(clearIdentity)
    })
  })
})

describe('clearIdentity', () => {
  describe('when the user is not a valid ethereum address', () => {
    it('should throw an error indicating the user must be a valid ethereum address', () => {
      expect(() => clearIdentity('not-an-address')).toThrow('User must be a valid ethereum address')
    })
  })

  describe('when an identity is stored for the user', () => {
    beforeEach(() => {
      localStorage.setItem(USER_KEY, JSON.stringify(buildIdentity(new Date(Date.now() + 60_000))))
      clearIdentity(VALID_USER)
    })

    it('should remove the identity from local storage', () => {
      expect(localStorage.getItem(USER_KEY)).toBeNull()
    })
  })
})
