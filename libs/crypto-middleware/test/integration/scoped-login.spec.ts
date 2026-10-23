import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import type { IFetchComponent, IHttpServerComponent } from '@dcl/core-commons'
import { Authenticator } from '@dcl/crypto'
import type { AuthIdentity, ScopedLoginGrant } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { requireOperation, wellKnownComponents } from '../../src/index'
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

  describe('and the service has no service identifier', () => {
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

  describe('and the login grants something to the service', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'insights' })
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

  describe('and the login grants nothing to the service', () => {
    beforeEach(async () => {
      outcome = await authenticate(requestSignedWith(identity), { service: 'worlds' })
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

describe('when a request is signed with a full login and the service has a service identifier', () => {
  let outcome: Outcome

  beforeEach(async () => {
    outcome = await authenticate(requestSignedWith(fullLogin), { service: 'insights' })
  })

  afterEach(() => {
    jest.clearAllMocks()
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

describe('when a route requires an operation', () => {
  let ctx: Ctx
  let next: jest.Mock
  let result: IHttpServerComponent.IResponse

  beforeEach(() => {
    next = jest.fn().mockResolvedValue({ status: 200, body: 'ok' })
    ctx = { request: { method: METHOD, headers: new Headers() }, url: { pathname: PATH } } as unknown as Ctx
  })

  describe('and the request has no verification', () => {
    beforeEach(async () => {
      result = await requireOperation('logs-read')(ctx, next)
    })

    it('should respond 401', () => {
      expect(result).toMatchObject({ status: 401, body: { ok: false, message: 'Authentication required' } })
    })
  })

  describe('and the request was signed with a full login', () => {
    beforeEach(async () => {
      ctx.verification = { auth: '0xowner', authMetadata: {} }
      result = await requireOperation('logs-delete')(ctx, next)
    })

    it('should call next', () => {
      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the scope grants the operation', () => {
    beforeEach(async () => {
      ctx.verification = {
        auth: '0xowner',
        authMetadata: {},
        scope: { service: 'insights', expiration: Date.now() + 60_000, grants: GRANTS }
      }
      result = await requireOperation('logs-read')(ctx, next)
    })

    it('should call next', () => {
      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the scope does not grant the operation', () => {
    beforeEach(async () => {
      ctx.verification = {
        auth: '0xowner',
        authMetadata: {},
        scope: { service: 'insights', expiration: Date.now() + 60_000, grants: GRANTS }
      }
      result = await requireOperation('logs-delete')(ctx, next)
    })

    it('should respond 403 naming the operation', () => {
      expect(result).toMatchObject({
        status: 403,
        body: { ok: false, message: 'The scoped login does not grant "logs-delete"' }
      })
    })
  })

  describe('and the scope grants the operation only on another resource', () => {
    beforeEach(async () => {
      ctx.verification = {
        auth: '0xowner',
        authMetadata: {},
        scope: { service: 'insights', expiration: Date.now() + 60_000, grants: GRANTS }
      }
      result = await requireOperation('metrics-read', { resource: () => 'world:other.dcl.eth' })(ctx, next)
    })

    it('should respond 403', () => {
      expect(result).toMatchObject({ status: 403 })
    })
  })

  describe('and the scope grants the operation on the same resource', () => {
    beforeEach(async () => {
      ctx.verification = {
        auth: '0xowner',
        authMetadata: {},
        scope: { service: 'insights', expiration: Date.now() + 60_000, grants: GRANTS }
      }
      result = await requireOperation('metrics-read', { resource: () => 'world:example.dcl.eth' })(ctx, next)
    })

    it('should call next', () => {
      expect(next).toHaveBeenCalledTimes(1)
    })
  })

  describe('and the operation name is not valid', () => {
    it('should throw at creation', () => {
      expect(() => requireOperation('*')).toThrow('operation must be')
    })
  })
})
