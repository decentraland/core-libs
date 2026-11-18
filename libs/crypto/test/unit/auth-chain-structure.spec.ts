import { Authenticator } from '../../src/Authenticator'
import { ScopedAuthLinkType } from '../../src/scoped-login'
import { AuthLinkType } from '../../src/types'
import type { AuthChain, AuthLink, ValidationResult } from '../../src/types'

function link(type: string): AuthLink {
  return { type: type as AuthLinkType, payload: 'payload', signature: '0x' + 'ab'.repeat(65) }
}

const SIGNER: AuthLink = { type: AuthLinkType.SIGNER, payload: '0x' + '1'.repeat(40), signature: '' }

describe('when checking the structure of an auth chain', () => {
  describe.each<[string, string[]]>([
    ['a SIGNER followed by a signed entity', [AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY]],
    ['a SIGNER followed by a delegation', [AuthLinkType.ECDSA_PERSONAL_EPHEMERAL]],
    [
      'a personal delegation followed by a signed entity',
      [AuthLinkType.ECDSA_PERSONAL_EPHEMERAL, AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY]
    ],
    [
      'a contract-wallet delegation followed by a contract-wallet signed entity',
      [AuthLinkType.ECDSA_EIP_1654_EPHEMERAL, AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY]
    ],
    [
      'two delegations followed by a signed entity',
      [
        AuthLinkType.ECDSA_EIP_1654_EPHEMERAL,
        AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY
      ]
    ],
    [
      'a scoped delegation followed by a personal signed entity',
      [ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL, AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY]
    ],
    [
      'a delegation, a scoped delegation and a personal signed entity',
      [
        AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL,
        AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY
      ]
    ]
  ])('and the chain is %s', (_, types) => {
    let chain: AuthChain

    beforeEach(() => {
      chain = [SIGNER, ...types.map(link)]
    })

    it('should accept it', () => {
      expect(Authenticator.isValidAuthChain(chain)).toBe(true)
    })
  })

  describe.each<[string, string[]]>([
    [
      'a personal signed entity followed by a delegation',
      [AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, AuthLinkType.ECDSA_PERSONAL_EPHEMERAL]
    ],
    [
      'a personal signed entity followed by another signed entity',
      [AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY]
    ],
    [
      'a contract-wallet signed entity followed by a personal signed entity',
      [AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY]
    ],
    [
      'a delegation, a signed entity and another delegation',
      [
        AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
        AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
        AuthLinkType.ECDSA_PERSONAL_EPHEMERAL
      ]
    ],
    ['an unknown link type before the last link', ['UNKNOWN_LINK_TYPE', AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY]],
    [
      'a scoped delegation followed by a contract-wallet signed entity',
      [ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL, AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY]
    ]
  ])('and the chain is %s', (_, types) => {
    let chain: AuthChain

    beforeEach(() => {
      chain = [SIGNER, ...types.map(link)]
    })

    it('should refuse it', () => {
      expect(Authenticator.isValidAuthChain(chain)).toBe(false)
    })
  })
})

describe('when validating a chain whose signed entity is not the last link', () => {
  let chain: AuthChain
  let result: ValidationResult

  beforeEach(async () => {
    chain = [SIGNER, link(AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY), link(AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY)]
    result = await Authenticator.validateSignature('payload', chain, null)
  })

  it('should refuse it as a malformed chain', () => {
    expect(result).toEqual({ ok: false, message: 'ERROR: Malformed authChain' })
  })
})
