import type { IFetchComponent, IHttpServerComponent } from '@dcl/core-commons'
import { Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { AUTH_METADATA_HEADER, wellKnownComponents } from '../../src/index'
import { identity, ownerAddress } from '../fixtures/identity'
import type { DecentralandSignatureContext, Options } from '../../src/types'

// Unlike test/unit/adapters.spec.ts, this file does NOT mock src/verify — it drives the real
// middleware end to end so the guard is exercised through the same path a request takes.

type Ctx = IHttpServerComponent.DefaultContext<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext, string>
>

const method = 'GET'
const path = '/scene/resource'
const fetcher = { fetch: jest.fn() } as unknown as IFetchComponent

const CANONICAL = { signer: 'decentraland-kernel-scene', intent: 'dcl:explorer:comms-handshake' }
const SPOOFED = '{"signer":"Decentraland-Kernel-Scene","intent":"dcl:explorer:comms-handshake"}'

/**
 * Signs the canonical metadata, then delivers `deliveredMetadata` instead. Because createPayload
 * lowercases the signed payload, any spelling that lowercases to the canonical form arrives with
 * an intact, valid signature.
 */
function requestWith(deliveredMetadata: string): Ctx {
  const timestamp = Date.now()
  const payload = [method, path, timestamp, JSON.stringify(CANONICAL)].join(':').toLowerCase()
  const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, CANONICAL)
  headers[AUTH_METADATA_HEADER] = deliveredMetadata

  return {
    request: { method, headers: new Headers(headers) },
    url: { pathname: path }
  } as unknown as Ctx
}

async function run(ctx: Ctx, options: Options = {}) {
  const next = jest.fn().mockResolvedValue({ status: 200, body: 'ok' })
  const result = await wellKnownComponents({ fetcher, ...options })(ctx, next)
  return { next, result, verification: (ctx as unknown as DecentralandSignatureContext).verification }
}

describe('wellKnownComponents canonical metadata enforcement', () => {
  describe('when a guarded field is not in canonical lowercase form', () => {
    it('should respond 400 with the metadata echoed back and not call next', async () => {
      const { next, result, verification } = await run(requestWith(SPOOFED))

      // DEFAULT_ERROR_FORMAT passes 4xx messages through verbatim, so the client sees its own
      // metadata and can spot the casing itself — bounded by safe()'s 64-char cap, which this
      // metadata exceeds.
      const echoed = `${SPOOFED.slice(0, 64)}…`
      expect(result).toEqual({ status: 400, body: { ok: false, message: `Invalid chain metadata: "${echoed}"` } })
      expect(SPOOFED.length).toBeGreaterThan(64)
      expect(next).not.toHaveBeenCalled()
      expect(verification).toBeUndefined()
    })
  })

  describe('when every guarded field is canonical', () => {
    it('should call next and expose the metadata on the verification', async () => {
      const { next, result, verification } = await run(requestWith(JSON.stringify(CANONICAL)))

      expect(result).toEqual({ status: 200, body: 'ok' })
      expect(next).toHaveBeenCalled()
      expect(verification).toEqual({ auth: ownerAddress, authMetadata: CANONICAL })
    })
  })

  describe('when a guarded field is non-canonical and the middleware is optional', () => {
    it('should fall through unauthenticated rather than reject', async () => {
      const { next, result, verification } = await run(requestWith(SPOOFED), { optional: true })

      // Documented behavior for every verify() failure under `optional`: the request proceeds
      // anonymously. It cannot impersonate a user, but it is not rejected either.
      expect(result).toEqual({ status: 200, body: 'ok' })
      expect(next).toHaveBeenCalled()
      expect(verification).toBeUndefined()
    })
  })
})
