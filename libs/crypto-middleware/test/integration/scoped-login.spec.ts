import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import type { IFetchComponent, IHttpServerComponent } from '@dcl/core-commons'
import { AuthLinkType, Authenticator, ScopedAuthLinkType } from '@dcl/crypto'
import type { AuthChain, AuthIdentity, ScopedLoginGrant } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { wellKnownComponents } from '../../src/index'
import { validateScopedAuthChainSignature } from '../../src/signature-validation'
import { identity as fullLogin } from '../fixtures/identity'
import type { AuthChainProvider } from '../../src/rpc-provider'
import type { DecentralandSignatureContext, DecentralandSignatureData, Options } from '../../src/types'

// Drives the real middleware, so a scoped login is exercised through the path a request takes.

type Ctx = IHttpServerComponent.DefaultContext<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext, string>
>

const METHOD = 'GET'
const PATH = '/v1/logs'
const fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
const GRANTS: ScopedLoginGrant[] = [
  { service: 'insights', operation: 'logs-read' },
  { service: 'insights', operation: 'metrics-read', resource: 'world:example.dcl.eth' }
]

function payloadFor(timestamp: number): string {
  return [METHOD.toLowerCase(), PATH, String(timestamp), '{}'].join(':')
}

async function scopedLogin(grants: ScopedLoginGrant[], minutes = 60): Promise<AuthIdentity> {
  const owner = createUnsafeIdentity()
  return Authenticator.initializeScopedAuthChain(owner.address, createUnsafeIdentity(), minutes, grants, async (m) =>
    Authenticator.createSignature(owner, m)
  )
}

function requestSignedWith(identity: AuthIdentity): Ctx {
  const timestamp = Date.now()
  const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payloadFor(timestamp)), timestamp, {})
  return {
    request: { method: METHOD, headers: new Headers(headers) },
    url: { pathname: PATH }
  } as unknown as Ctx
}

async function authenticate(ctx: Ctx, options: Options = {}) {
  const next = jest.fn().mockResolvedValue({ status: 200, body: 'ok' })
  const result = await wellKnownComponents({ fetcher, ...options })(ctx, next)
  return { next, result, verification: (ctx as unknown as DecentralandSignatureContext).verification }
}

type Outcome = Awaited<ReturnType<typeof authenticate>>

describe('when a request is signed with a scoped login', () => {
  let identity: AuthIdentity
  let outcome: Outcome

  beforeEach(async () => {
    identity = await scopedLogin([...GRANTS, { service: 'badges', operation: 'award' }])
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the middleware has no service identifier', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity))
    })

    it('should respond 401 saying scoped logins need a service identifier', () => {
      expect(outcome.result).toMatchObject({
        status: 401,
        body: { ok: false, message: expect.stringContaining('Scoped logins are not accepted') }
      })
    })

    it('should not call next', () => {
      expect(outcome.next).not.toHaveBeenCalled()
    })
  })

  describe('and the route has a service identifier but no operation', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights' })
    })

    it('should respond 401 saying the route does not accept scoped logins', () => {
      expect(outcome.result).toMatchObject({
        status: 401,
        body: { ok: false, message: 'This route does not accept scoped logins' }
      })
    })

    it('should not set a verification', () => {
      expect(outcome.verification).toBeUndefined()
    })
  })

  describe('and the login grants the route operation', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights', operation: 'logs-read' })
    })

    it('should call next', () => {
      expect(outcome.next).toHaveBeenCalledTimes(1)
    })

    it('should set the signer and the grants for that service only on the verification', () => {
      expect(outcome.verification).toEqual<DecentralandSignatureData>({
        auth: identity.authChain[0].payload.toLowerCase(),
        authMetadata: {},
        scope: { service: 'insights', expiration: identity.expiration.getTime(), grants: GRANTS }
      })
    })
  })

  describe('and the login does not grant the route operation', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights', operation: 'logs-delete' })
    })

    it('should respond 403 naming the operation', () => {
      expect(outcome.result).toMatchObject({
        status: 403,
        body: { ok: false, message: 'The scoped login does not grant "logs-delete"' }
      })
    })

    it('should not call next', () => {
      expect(outcome.next).not.toHaveBeenCalled()
    })
  })

  describe('and the login grants the route operation only on another resource', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), {
        service: 'insights',
        operation: 'metrics-read',
        resource: () => 'world:other.dcl.eth'
      })
    })

    it('should respond 403', () => {
      expect(outcome.result).toMatchObject({ status: 403 })
    })
  })

  describe('and the login grants the route operation on the same resource', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), {
        service: 'insights',
        operation: 'metrics-read',
        resource: () => 'world:example.dcl.eth'
      })
    })

    it('should call next', () => {
      expect(outcome.next).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the route chooses an operation the login grants', () => {
    let operation: jest.Mock

    beforeEach(async () => {
      operation = jest.fn().mockReturnValueOnce('logs-read')
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights', operation })
    })

    it('should call next', () => {
      expect(outcome.next).toHaveBeenCalledTimes(1)
    })

    it('should choose the operation from the request context', () => {
      expect(operation).toHaveBeenCalledWith(expect.objectContaining({ url: { pathname: PATH } }))
    })
  })

  describe('and the route chooses no operation for the request', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights', operation: () => undefined })
    })

    it('should respond 401 saying the route does not accept scoped logins', () => {
      expect(outcome.result).toMatchObject({
        status: 401,
        body: { ok: false, message: 'This route does not accept scoped logins' }
      })
    })
  })

  describe('and the route chooses the wildcard as its operation', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights', operation: () => '*' })
    })

    it('should respond 401 saying the route does not accept scoped logins', () => {
      expect(outcome.result).toMatchObject({
        status: 401,
        body: { ok: false, message: 'This route does not accept scoped logins' }
      })
    })
  })

  describe('and the middleware is optional and the login does not grant the route operation', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), {
        service: 'insights',
        operation: 'logs-delete',
        optional: true
      })
    })

    it('should respond 403 instead of letting the request through', () => {
      expect(outcome.result).toMatchObject({ status: 403 })
    })
  })

  describe('and the login grants nothing to the service', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'worlds', operation: 'deploy' })
    })

    it('should respond 401 saying the login grants nothing to the service', () => {
      expect(outcome.result).toMatchObject({
        status: 401,
        body: { ok: false, message: expect.stringContaining('grants nothing to "worlds"') }
      })
    })
  })

  describe('and the login lasts longer than the service accepts', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), {
        service: 'insights',
        operation: 'logs-read',
        maxScopedLoginLifetime: 10 * 60 * 1000
      })
    })

    it('should respond 401 saying it lasts longer than accepted', () => {
      expect(outcome.result).toMatchObject({
        status: 401,
        body: { ok: false, message: expect.stringContaining('lasts longer than this verifier accepts') }
      })
    })
  })
})

describe('when a request is signed with a scoped login delegated through a contract wallet', () => {
  let ctx: Ctx
  let outcome: Outcome

  beforeEach(async () => {
    const ephemeral = createUnsafeIdentity()
    const scoped = createUnsafeIdentity()
    const expiration = new Date(Date.now() + 60 * 60 * 1000)
    const authChain: AuthChain = [
      { type: AuthLinkType.SIGNER, payload: '0x1111111111111111111111111111111111111111', signature: '' },
      {
        type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL,
        payload: Authenticator.getEphemeralMessage(ephemeral.address, expiration),
        signature: '0x00'
      },
      {
        type: ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL as unknown as AuthLinkType,
        payload: Authenticator.getScopedEphemeralMessage(scoped.address, expiration, GRANTS),
        signature: Authenticator.createSignature(
          ephemeral,
          Authenticator.getScopedEphemeralMessage(scoped.address, expiration, GRANTS)
        )
      }
    ]
    // Three links, the shape the middleware would otherwise hand to the catalyst.
    ctx = {
      request: { method: METHOD, headers: new Headers(createAuthChainHeaders(authChain, Date.now(), {})) },
      url: { pathname: PATH }
    } as unknown as Ctx
    outcome = await authenticate(ctx, { service: 'insights', operation: 'logs-read' })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should respond 401', () => {
    expect(outcome.result).toMatchObject({ status: 401 })
  })

  it('should not ask the catalyst to validate it', () => {
    expect(fetcher.fetch).not.toHaveBeenCalled()
  })
})

describe('when a request is signed with a full login and the route has an operation', () => {
  let outcome: Outcome

  beforeEach(async () => {
    outcome = await authenticate(requestSignedWith(fullLogin), { service: 'insights', operation: 'logs-delete' })
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should call next', () => {
    expect(outcome.next).toHaveBeenCalledTimes(1)
  })

  it('should set a verification without a scope', () => {
    expect(outcome.verification).toEqual<DecentralandSignatureData>({
      auth: fullLogin.authChain[0].payload.toLowerCase(),
      authMetadata: {}
    })
  })
})

describe('when the middleware is created with scoped login options', () => {
  describe('and the service identifier is malformed', () => {
    it('should throw at creation', () => {
      expect(() => wellKnownComponents({ service: 'Insights' })).toThrow('service must be')
    })
  })

  describe('and the maximum scoped login lifetime is not a positive number', () => {
    it('should throw at creation', () => {
      expect(() => wellKnownComponents({ service: 'insights', maxScopedLoginLifetime: NaN })).toThrow(
        'maxScopedLoginLifetime must be'
      )
    })
  })

  describe('and the maximum scoped login lifetime has no service identifier', () => {
    it('should throw at creation', () => {
      expect(() => wellKnownComponents({ maxScopedLoginLifetime: 60_000 })).toThrow(
        'maxScopedLoginLifetime needs a service'
      )
    })
  })

  describe('and the operation has no service identifier', () => {
    it('should throw at creation', () => {
      expect(() => wellKnownComponents({ operation: 'logs-read' })).toThrow('operation needs a service')
    })
  })

  describe('and the operation is the wildcard', () => {
    it('should throw at creation', () => {
      expect(() => wellKnownComponents({ service: 'insights', operation: '*' })).toThrow('operation must be')
    })
  })

  describe('and the resource has no operation', () => {
    it('should throw at creation', () => {
      expect(() => wellKnownComponents({ service: 'insights', resource: () => 'world:example.dcl.eth' })).toThrow(
        'resource needs an operation'
      )
    })
  })
})

describe('when a scoped login is validated with a provider', () => {
  let identity: AuthIdentity
  let provider: AuthChainProvider
  let timestamp: number

  beforeEach(async () => {
    identity = await scopedLogin(GRANTS)
    // A personal-signature chain needs no RPC call, so the provider must never be used.
    provider = { sendAsync: jest.fn() }
    timestamp = Date.now()
  })

  it('should resolve with the scope of the login', async () => {
    await expect(
      validateScopedAuthChainSignature(
        Authenticator.signPayload(identity, payloadFor(timestamp)),
        payloadFor(timestamp),
        provider,
        { service: 'insights' }
      )
    ).resolves.toEqual({ service: 'insights', expiration: identity.expiration.getTime(), grants: GRANTS })
  })
})
