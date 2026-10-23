import * as EthCrypto from 'eth-crypto'
import { Authenticator, getScopedEphemeralSignatureType, parseEphemeralPayload } from '../../src/Authenticator'
import { SignatureValidator } from '../../src/contracts/SignatureValidator'
import {
  MAX_SCOPED_LOGIN_GRANTS,
  ScopedAuthLinkType,
  getScopedEphemeralMessage,
  isOperationGranted,
  parseScopedEphemeralPayload
} from '../../src/scoped-login'
import { AuthLinkType } from '../../src/types'
import type {
  AuthChain,
  AuthIdentity,
  IdentityType,
  ScopedLoginGrant,
  ScopedLoginScope,
  ValidationResult
} from '../../src/types'

jest.mock('../../src/contracts/SignatureValidator', () => ({
  SignatureValidator: jest.fn()
}))

const ERC1654_MAGIC_VALUE_BYTES = new Uint8Array([0x16, 0x26, 0xba, 0x7e])
const EPHEMERAL = '0x1111111111111111111111111111111111111111'
const EXPIRATION = new Date('2030-01-01T00:00:00.000Z')
const PAYLOAD = 'get:/v1/logs:1:{}'
const INSIGHTS_GRANTS: ScopedLoginGrant[] = [
  { service: 'insights', operation: 'logs-read' },
  { service: 'insights', operation: 'metrics-read', resource: 'world:example.dcl.eth' }
]

/** A scoped identity signed by `owner`, and a request signed with it. */
async function scopedChain(
  owner: IdentityType,
  grants: ScopedLoginGrant[],
  minutes = 60
): Promise<{ identity: AuthIdentity; chain: AuthChain }> {
  const ephemeral = EthCrypto.createIdentity()
  const identity = await Authenticator.initializeScopedAuthChain(owner.address, ephemeral, minutes, grants, async (m) =>
    Authenticator.createSignature(owner, m)
  )
  return { identity, chain: Authenticator.signPayload(identity, PAYLOAD) }
}

describe('when building a scoped login message', () => {
  describe('and every value is well formed', () => {
    let message: string

    beforeEach(() => {
      message = getScopedEphemeralMessage(EPHEMERAL.toUpperCase().replace('0X', '0x'), EXPIRATION, INSIGHTS_GRANTS)
    })

    it('should write the prefix, the lowercase ephemeral address, the ISO expiration and one Allow line per grant', () => {
      expect(message).toBe(
        [
          'Decentraland Scoped Login',
          `Ephemeral: ${EPHEMERAL}`,
          'Expiration: 2030-01-01T00:00:00.000Z',
          'Allow: insights:logs-read',
          'Allow: insights:metrics-read for world:example.dcl.eth'
        ].join('\n')
      )
    })
  })

  describe.each<[string, string, Date, ScopedLoginGrant[], string]>([
    ['the ephemeral address is malformed', '0x1234', EXPIRATION, INSIGHTS_GRANTS, 'ephemeral address'],
    ['the expiration is not a valid date', EPHEMERAL, new Date('nope'), INSIGHTS_GRANTS, 'expiration'],
    ['there are no grants', EPHEMERAL, EXPIRATION, [], 'between 1 and'],
    [
      'there are more grants than allowed',
      EPHEMERAL,
      EXPIRATION,
      Array.from({ length: MAX_SCOPED_LOGIN_GRANTS + 1 }, (_, i) => ({ service: 'insights', operation: `op-${i}` })),
      'between 1 and'
    ],
    ['a service is not lowercase', EPHEMERAL, EXPIRATION, [{ service: 'Insights', operation: 'read' }], 'grant'],
    ['an operation has a colon', EPHEMERAL, EXPIRATION, [{ service: 'insights', operation: 'logs:read' }], 'grant'],
    [
      'a resource has a space',
      EPHEMERAL,
      EXPIRATION,
      [{ service: 'insights', operation: 'read', resource: 'world:a b' }],
      'grant'
    ],
    ['a grant is repeated', EPHEMERAL, EXPIRATION, [INSIGHTS_GRANTS[0], { ...INSIGHTS_GRANTS[0] }], 'Repeated'],
    [
      'the message would be longer than allowed',
      EPHEMERAL,
      EXPIRATION,
      Array.from({ length: MAX_SCOPED_LOGIN_GRANTS }, (_, i) => ({
        service: 'insights',
        operation: 'read',
        resource: `world:${String(i).padStart(250, 'x')}`
      })),
      'bytes'
    ]
  ])('and %s', (_case, ephemeral, expiration, grants, message) => {
    it(`should throw an error mentioning "${message}"`, () => {
      expect(() => getScopedEphemeralMessage(ephemeral, expiration, grants)).toThrow(message)
    })
  })
})

describe('when parsing a scoped login message', () => {
  describe('and it was written by the builder', () => {
    let message: string

    beforeEach(() => {
      message = getScopedEphemeralMessage(EPHEMERAL, EXPIRATION, INSIGHTS_GRANTS)
    })

    it('should return the ephemeral address, the expiration in millis and every grant', () => {
      expect(parseScopedEphemeralPayload(message)).toEqual({
        ephemeralAddress: EPHEMERAL,
        expiration: EXPIRATION.getTime(),
        grants: INSIGHTS_GRANTS
      })
    })
  })

  const valid = getScopedEphemeralMessage(EPHEMERAL, EXPIRATION, INSIGHTS_GRANTS)
  describe.each<[string, string]>([
    ['it has another prefix', valid.replace('Decentraland Scoped Login', 'Decentraland Login')],
    ['it is a Decentraland Login message', Authenticator.getEphemeralMessage(EPHEMERAL, EXPIRATION)],
    ['it uses CRLF line endings', valid.replace(/\n/g, '\r\n')],
    ['it ends with a line feed', `${valid}\n`],
    ['it has an empty line', valid.replace('\nAllow', '\n\nAllow')],
    ['the ephemeral address is not lowercase', valid.replace(EPHEMERAL, '0x' + 'A'.repeat(40))],
    ['the expiration is not in toISOString form', valid.replace('2030-01-01T00:00:00.000Z', '2030-01-01T00:00:00Z')],
    [
      'Expiration comes before Ephemeral',
      valid.replace(
        `Ephemeral: ${EPHEMERAL}\nExpiration: 2030-01-01T00:00:00.000Z`,
        `Expiration: 2030-01-01T00:00:00.000Z\nEphemeral: ${EPHEMERAL}`
      )
    ],
    ['it has no grants', valid.split('\n').slice(0, 3).join('\n')],
    ['a grant is repeated', `${valid}\nAllow: insights:logs-read`],
    ['a grant has a trailing space', valid.replace('Allow: insights:logs-read', 'Allow: insights:logs-read ')],
    ['a grant has no operation', valid.replace('Allow: insights:logs-read', 'Allow: insights')],
    ['a line is not a grant', `${valid}\nDeny: insights:logs-read`],
    [
      'it has more grants than allowed',
      [
        ...valid.split('\n').slice(0, 3),
        ...Array.from({ length: MAX_SCOPED_LOGIN_GRANTS + 1 }, (_, i) => `Allow: insights:op-${i}`)
      ].join('\n')
    ]
  ])('and %s', (_case, payload) => {
    it('should throw an error', () => {
      expect(() => parseScopedEphemeralPayload(payload)).toThrow()
    })
  })
})

describe('when a scoped login message is read as a Decentraland Login message', () => {
  let message: string

  beforeEach(() => {
    message = getScopedEphemeralMessage(EPHEMERAL, EXPIRATION, INSIGHTS_GRANTS)
  })

  it('should throw, since its second line is not an "Ephemeral address" line', () => {
    expect(() => parseEphemeralPayload(message)).toThrow('Invalid ephemeral payload')
  })
})

describe('when getting the type of a scoped link signature', () => {
  describe('and the signature is a personal signature', () => {
    let signature: string

    beforeEach(() => {
      signature = Authenticator.createSignature(EthCrypto.createIdentity(), 'message')
    })

    it('should be ECDSA_SCOPED_EPHEMERAL', () => {
      expect(getScopedEphemeralSignatureType(signature)).toBe(ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL)
    })
  })

  describe('and the signature comes from a contract wallet', () => {
    let signature: string

    beforeEach(() => {
      signature = '0x' + 'ab'.repeat(100)
    })

    it('should be ECDSA_EIP_1654_SCOPED_EPHEMERAL', () => {
      expect(getScopedEphemeralSignatureType(signature)).toBe(ScopedAuthLinkType.ECDSA_EIP_1654_SCOPED_EPHEMERAL)
    })
  })
})

describe('when validating a scoped login chain', () => {
  let owner: IdentityType
  let identity: AuthIdentity
  let chain: AuthChain
  let result: ValidationResult

  beforeEach(async () => {
    owner = EthCrypto.createIdentity()
    ;({ identity, chain } = await scopedChain(owner, [...INSIGHTS_GRANTS, { service: 'badges', operation: 'award' }]))
  })

  describe('and the verifier has no service identifier', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(PAYLOAD, chain, null)
    })

    it('should reject it because scoped logins need a service identifier', () => {
      expect(result).toEqual({
        ok: false,
        message: 'ERROR: Scoped logins are not accepted without a service identifier'
      })
    })
  })

  describe('and the verifier has a malformed service identifier', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'Insights' })
    })

    it('should reject it', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and the login grants something to the verifier', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
    })

    it('should accept it with the grants for that service only', () => {
      expect(result).toEqual({
        ok: true,
        message: undefined,
        scope: { service: 'insights', expiration: identity.expiration.getTime(), grants: INSIGHTS_GRANTS }
      })
    })
  })

  describe('and the login grants nothing to the verifier', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'worlds' })
    })

    it('should reject it saying the login grants nothing to that service', () => {
      expect(result).toEqual({ ok: false, message: 'ERROR: The scoped login grants nothing to "worlds"' })
    })
  })

  describe('and the verifier caps the lifetime of scoped logins', () => {
    describe('and the login expires within the cap', () => {
      beforeEach(async () => {
        result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), {
          service: 'insights',
          maxScopedLoginLifetimeInMillis: 2 * 60 * 60 * 1000
        })
      })

      it('should accept it', () => {
        expect(result.ok).toBe(true)
      })
    })

    describe('and the login expires after the cap', () => {
      beforeEach(async () => {
        result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), {
          service: 'insights',
          maxScopedLoginLifetimeInMillis: 10 * 60 * 1000
        })
      })

      it('should reject it saying it lasts longer than the verifier accepts', () => {
        expect(result).toEqual({
          ok: false,
          message: 'ERROR: The scoped login lasts longer than this verifier accepts'
        })
      })
    })

    describe('and the cap is not a finite positive number', () => {
      beforeEach(async () => {
        result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), {
          service: 'insights',
          maxScopedLoginLifetimeInMillis: NaN
        })
      })

      it('should reject it', () => {
        expect(result.ok).toBe(false)
      })
    })
  })

  describe('and the scoped link has expired', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now() + 2 * 60 * 60 * 1000, {
        service: 'insights'
      })
    })

    it('should reject it as an expired ephemeral key', () => {
      expect(result.message).toContain('Ephemeral key expired')
    })
  })

  describe('and a grant was added to the message after it was signed', () => {
    beforeEach(async () => {
      chain[1] = { ...chain[1], payload: `${chain[1].payload}\nAllow: worlds:deploy` }
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
    })

    it('should reject it as signed by another address', () => {
      expect(result.message).toContain('Invalid signer address')
    })
  })

  describe('and the request was signed by another key', () => {
    beforeEach(async () => {
      chain[2] = { ...chain[2], signature: Authenticator.createSignature(EthCrypto.createIdentity(), PAYLOAD) }
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
    })

    it('should reject it', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and the scoped link delegates to another ephemeral key', () => {
    beforeEach(async () => {
      const next = EthCrypto.createIdentity()
      const message = Authenticator.getEphemeralMessage(next.address, identity.expiration)
      chain = [
        ...identity.authChain,
        {
          type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
          payload: message,
          signature: Authenticator.createSignature(identity.ephemeralIdentity, message)
        },
        {
          type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
          payload: PAYLOAD,
          signature: Authenticator.createSignature(next, PAYLOAD)
        }
      ]
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
    })

    it('should reject it as an invalid scoped login chain', () => {
      expect(result.message).toContain('Invalid scoped login chain')
    })
  })

  describe('and the chain is the scoped identity, without a request link', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(
        identity.ephemeralIdentity.address.toLowerCase(),
        identity.authChain,
        null,
        Date.now(),
        { service: 'insights' }
      )
    })

    it('should accept it, with the ephemeral address as the final authority', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and a request link is followed by another link', () => {
    beforeEach(async () => {
      chain = [...chain, { ...chain[2] }]
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
    })

    it('should reject it as an invalid scoped login chain', () => {
      expect(result.message).toContain('Invalid scoped login chain')
    })
  })

  describe('and the chain has two scoped links', () => {
    beforeEach(async () => {
      const next = EthCrypto.createIdentity()
      const message = getScopedEphemeralMessage(next.address, identity.expiration, INSIGHTS_GRANTS)
      chain = [
        ...identity.authChain,
        {
          type: getScopedEphemeralSignatureType('0x' + '0'.repeat(130)),
          payload: message,
          signature: Authenticator.createSignature(identity.ephemeralIdentity, message)
        },
        {
          type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
          payload: PAYLOAD,
          signature: Authenticator.createSignature(next, PAYLOAD)
        }
      ]
      result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
    })

    it('should reject it as an invalid scoped login chain', () => {
      expect(result.message).toContain('Invalid scoped login chain')
    })
  })
})

describe('when validating a scoped login delegated by a key holding a full login', () => {
  let chain: AuthChain
  let result: ValidationResult

  beforeEach(async () => {
    const owner = EthCrypto.createIdentity()
    const browserKey = EthCrypto.createIdentity()
    const scopedKey = EthCrypto.createIdentity()
    const expiration = new Date(Date.now() + 60 * 60 * 1000)
    const login = Authenticator.getEphemeralMessage(browserKey.address, expiration)
    const scoped = getScopedEphemeralMessage(scopedKey.address, expiration, INSIGHTS_GRANTS)
    chain = [
      { type: AuthLinkType.SIGNER, payload: owner.address, signature: '' },
      {
        type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        payload: login,
        signature: Authenticator.createSignature(owner, login)
      },
      {
        type: getScopedEphemeralSignatureType('0x' + '0'.repeat(130)),
        payload: scoped,
        signature: Authenticator.createSignature(browserKey, scoped)
      },
      {
        type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
        payload: PAYLOAD,
        signature: Authenticator.createSignature(scopedKey, PAYLOAD)
      }
    ]
    result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
  })

  it('should accept it', () => {
    expect(result.ok).toBe(true)
  })
})

describe('when validating a scoped login signed by a contract wallet', () => {
  let isValidSignatureMock: jest.Mock
  let chain: AuthChain
  let result: ValidationResult
  let provider: object

  beforeEach(() => {
    provider = {}
    isValidSignatureMock = jest.fn().mockResolvedValue(ERC1654_MAGIC_VALUE_BYTES)
    ;(SignatureValidator as jest.Mock).mockResolvedValue({ isValidSignature: isValidSignatureMock })
    const scopedKey = EthCrypto.createIdentity()
    const scoped = getScopedEphemeralMessage(scopedKey.address, new Date(Date.now() + 60 * 60 * 1000), INSIGHTS_GRANTS)
    chain = [
      { type: AuthLinkType.SIGNER, payload: '0x3b21028719a4aca7ebee35b0157a6f1b0cf0d0c5', signature: '' },
      {
        type: getScopedEphemeralSignatureType('0x' + 'ab'.repeat(100)),
        payload: scoped,
        signature: '0x' + 'ab'.repeat(100)
      },
      {
        type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
        payload: PAYLOAD,
        signature: Authenticator.createSignature(scopedKey, PAYLOAD)
      }
    ]
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the contract accepts the signature', () => {
    beforeEach(async () => {
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider, Date.now(), { service: 'insights' })
    })

    it('should accept it', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the scoped link has expired', () => {
    beforeEach(async () => {
      const expired = getScopedEphemeralMessage(EthCrypto.createIdentity().address, new Date(Date.now() - 1000), [
        INSIGHTS_GRANTS[0]
      ])
      chain = [chain[0], { ...chain[1], payload: expired }, chain[2]]
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider, Date.now(), { service: 'insights' })
    })

    it('should reject it as an expired ephemeral key', () => {
      expect(result.message).toContain('Ephemeral key expired')
    })

    it('should not ask the contract to validate the signature', () => {
      expect(isValidSignatureMock).not.toHaveBeenCalled()
    })
  })

  describe('and the scoped link does not follow the signer directly', () => {
    beforeEach(async () => {
      const login = Authenticator.getEphemeralMessage('0x' + '2'.repeat(40), new Date(Date.now() + 60 * 60 * 1000))
      chain = [
        chain[0],
        { type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL, payload: login, signature: '0x' + 'ab'.repeat(100) },
        ...chain.slice(1)
      ]
      result = await Authenticator.validateSignature(PAYLOAD, chain, provider, Date.now(), { service: 'insights' })
    })

    it('should reject it as an invalid scoped login chain', () => {
      expect(result.message).toContain('Invalid scoped login chain')
    })
  })
})

describe('when validating a Decentraland Login chain with a service identifier', () => {
  let result: ValidationResult

  beforeEach(async () => {
    const chain = Authenticator.createAuthChain(EthCrypto.createIdentity(), EthCrypto.createIdentity(), 5, PAYLOAD)
    result = await Authenticator.validateSignature(PAYLOAD, chain, null, Date.now(), { service: 'insights' })
  })

  it('should accept it without a scope, as a full login', () => {
    expect(result).toEqual({ ok: true, message: undefined })
  })
})

describe('when checking whether an operation is granted', () => {
  let scope: ScopedLoginScope

  beforeEach(() => {
    scope = {
      service: 'insights',
      expiration: EXPIRATION.getTime(),
      grants: [
        { service: 'insights', operation: 'logs-read' },
        { service: 'insights', operation: 'metrics-read', resource: 'world:example.dcl.eth' }
      ]
    }
  })

  describe('and there is no scope', () => {
    it('should allow it, as a full login allows everything', () => {
      expect(isOperationGranted(undefined, 'anything')).toBe(true)
    })
  })

  describe('and a grant names the operation without a resource', () => {
    it('should allow it on any resource', () => {
      expect(isOperationGranted(scope, 'logs-read', 'world:other.dcl.eth')).toBe(true)
    })
  })

  describe('and a grant names the operation and the same resource', () => {
    it('should allow it', () => {
      expect(isOperationGranted(scope, 'metrics-read', 'world:example.dcl.eth')).toBe(true)
    })
  })

  describe('and a grant names the operation and another resource', () => {
    it('should deny it', () => {
      expect(isOperationGranted(scope, 'metrics-read', 'world:other.dcl.eth')).toBe(false)
    })
  })

  describe('and a grant names a resource but the request has none', () => {
    it('should deny it', () => {
      expect(isOperationGranted(scope, 'metrics-read')).toBe(false)
    })
  })

  describe('and no grant names the operation', () => {
    it('should deny it', () => {
      expect(isOperationGranted(scope, 'logs-delete')).toBe(false)
    })
  })

  describe('and a grant allows every operation', () => {
    beforeEach(() => {
      scope.grants = [{ service: 'insights', operation: '*' }]
    })

    it('should allow any operation', () => {
      expect(isOperationGranted(scope, 'logs-delete')).toBe(true)
    })
  })

  describe('and the operation asked for is the wildcard', () => {
    beforeEach(() => {
      scope.grants = [{ service: 'insights', operation: '*' }]
    })

    it('should deny it, since the wildcard is not an operation', () => {
      expect(isOperationGranted(scope, '*')).toBe(false)
    })
  })
})
