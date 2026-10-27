import * as EthCrypto from 'eth-crypto'
import { Authenticator } from '../../src/Authenticator'
import { AuthLinkType } from '../../src/types'
import type {
  AuthChain,
  AuthIdentity,
  RequestAuthorizationResult,
  ScopedRequestAuthorizationOptions,
  ValidationResult
} from '../../src/types'

describe('when authorizing a scoped request action', () => {
  let identity: AuthIdentity
  let chain: AuthChain
  let options: ScopedRequestAuthorizationOptions
  let result: ValidationResult

  beforeEach(async () => {
    const owner = EthCrypto.createIdentity()
    identity = await Authenticator.initializeScopedAuthChain(
      owner.address,
      EthCrypto.createIdentity(),
      60,
      [{ service: 'insights', operation: 'metrics-read', resource: 'world:a.dcl.eth' }],
      async (message) => Authenticator.createSignature(owner, message)
    )
    chain = Authenticator.signPayload(identity, 'request')
    options = { service: 'insights', operation: 'metrics-read', resource: 'world:a.dcl.eth' }
  })

  describe('and the operation and resource are granted', () => {
    beforeEach(async () => {
      result = await Authenticator.authorizeSignature('request', chain, null, options)
    })
    it('should authorize the requested action', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe.each(['operation', 'resource'])('and another %s is requested', (field) => {
    beforeEach(async () => {
      if (field === 'operation') options.operation = 'metrics-delete'
      else options.resource = 'world:b.dcl.eth'
      result = await Authenticator.authorizeSignature('request', chain, null, options)
    })
    it('should deny the action despite a valid signature', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and only the stored delegation is presented', () => {
    beforeEach(async () => {
      result = await Authenticator.authorizeSignature(
        identity.ephemeralIdentity.address,
        identity.authChain,
        null,
        options
      )
    })
    it('should require a signed request rather than identity possession', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and a JavaScript caller omits the operation', () => {
    beforeEach(async () => {
      result = await Reflect.apply(Authenticator.authorizeSignature, undefined, [
        'request',
        chain,
        null,
        { service: 'insights' }
      ])
    })
    it('should reject instead of accepting service membership as authorization', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe.each([AuthLinkType.ECDSA_PERSONAL_EPHEMERAL, AuthLinkType.ECDSA_EIP_1654_EPHEMERAL])(
    'and a scoped link is retyped as %s',
    (linkType) => {
      beforeEach(async () => {
        chain[1].type = linkType
        result = await Authenticator.validateSignature('request', chain, null)
      })
      it('should reject the signed scoped payload as a full login', () => {
        expect(result.ok).toBe(false)
      })
    }
  )
  describe('and caller options change while the signature is being validated', () => {
    let authorization: RequestAuthorizationResult

    beforeEach(async () => {
      const pending = Authenticator.authorizeSignature('request', chain, null, options)
      options.resource = 'world:b.dcl.eth'
      authorization = await pending
    })
    it('should preserve and expose the originally requested resource', () => {
      expect([authorization.ok, authorization.resource]).toEqual([true, 'world:a.dcl.eth'])
    })
  })
})

describe('when a parent login expires before its scoped delegation', () => {
  let chain: AuthChain
  let parent: AuthIdentity
  let result: ValidationResult

  beforeEach(async () => {
    const owner = EthCrypto.createIdentity()
    const browser = EthCrypto.createIdentity()
    parent = await Authenticator.initializeAuthChain(owner.address, browser, 5, async (message) =>
      Authenticator.createSignature(owner, message)
    )
    const child = await Authenticator.initializeScopedAuthChain(
      browser.address,
      EthCrypto.createIdentity(),
      60,
      [{ service: 'insights', operation: 'logs-read' }],
      async (message) => Authenticator.createSignature(browser, message)
    )
    child.authChain = [...parent.authChain, ...child.authChain.slice(1)]
    chain = Authenticator.signPayload(child, 'request')
    result = await Authenticator.authorizeSignature('request', chain, null, {
      service: 'insights',
      operation: 'logs-read'
    })
  })

  it('should expose the earliest chain expiration for session TTLs', () => {
    expect(result.scope?.expiration).toBe(parent.expiration.getTime())
  })

  describe('and the parent expires', () => {
    beforeEach(async () => {
      result = await Authenticator.authorizeSignature(
        'request',
        chain,
        null,
        { service: 'insights', operation: 'logs-read' },
        parent.expiration.getTime() + 1
      )
    })
    it('should reject even while the scoped link remains unexpired', () => {
      expect(result.ok).toBe(false)
    })
  })
})

describe('when a scoped login lasts more than 24 hours', () => {
  let chain: AuthChain
  let result: ValidationResult

  beforeEach(async () => {
    const owner = EthCrypto.createIdentity()
    const identity = await Authenticator.initializeScopedAuthChain(
      owner.address,
      EthCrypto.createIdentity(),
      48 * 60,
      [{ service: 'insights', operation: 'logs-read' }],
      async (message) => Authenticator.createSignature(owner, message)
    )
    chain = Authenticator.signPayload(identity, 'request')
  })

  describe('and the service uses the default cap', () => {
    beforeEach(async () => {
      result = await Authenticator.authorizeSignature('request', chain, null, {
        service: 'insights',
        operation: 'logs-read'
      })
    })
    it('should reject the long-lived credential', () => {
      expect(result.ok).toBe(false)
    })
  })

  describe('and the service explicitly allows three days', () => {
    beforeEach(async () => {
      result = await Authenticator.authorizeSignature('request', chain, null, {
        service: 'insights',
        operation: 'logs-read',
        maxScopedLoginLifetimeInMillis: 3 * 86400000
      })
    })
    it('should accept the explicit policy', () => {
      expect(result.ok).toBe(true)
    })
  })
})
