import type { IFetchComponent, IHttpServerComponent } from '@dcl/core-commons'
import { Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { AUTH_METADATA_HEADER, wellKnownComponents } from '../../src/index'
import { identity, ownerAddress } from '../fixtures/identity'
import type { DecentralandSignatureContext, Options } from '../../src/types'

// Unlike test/unit/adapters.spec.ts, this file does NOT mock src/verify — it drives the real
// middleware end to end so the binding is exercised through the same path a request takes.

type Ctx = IHttpServerComponent.DefaultContext<
  IHttpServerComponent.PathAwareContext<DecentralandSignatureContext, string>
>

const method = 'GET'
const path = '/scene/resource'
const fetcher = { fetch: jest.fn() } as unknown as IFetchComponent

// The metadata a scene runtime signs, in the camelCase spelling every explorer client emits.
const SIGNED = '{"signer":"decentraland-kernel-scene","sceneId":"QmAbC","isGuest":false}'

/**
 * Signs SIGNED, then delivers `deliveredMetadata` with the signature left untouched. Under the
 * previous payload format — which lowercased the whole metadata string — every rewrite below was
 * byte-identical to SIGNED once lowercased, so it arrived with a valid signature and a field the
 * consumer could no longer see.
 */
function requestWith(deliveredMetadata: string): Ctx {
  const timestamp = Date.now()
  const payload = [method.toLowerCase(), path.toLowerCase(), String(timestamp), SIGNED].join(':')
  const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, JSON.parse(SIGNED))
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

describe('wellKnownComponents metadata binding', () => {
  describe.each([
    // Defeats `metadata.signer !== 'decentraland-kernel-scene'`: the key is gone, so the check
    // reads undefined and admits a scene-originated request.
    ['a reserved property name', '{"Signer":"decentraland-kernel-scene","sceneId":"QmAbC","isGuest":false}'],
    // Defeats a consumer authorizing on sceneId.
    ['a consumer-defined property name', '{"signer":"decentraland-kernel-scene","sceneid":"QmAbC","isGuest":false}'],
    // Defeats a boolean gate: absent reads falsy.
    ['a boolean property name', '{"signer":"decentraland-kernel-scene","sceneId":"QmAbC","IsGuest":false}'],
    // The value-casing variant the removed guard used to catch, now covered by the signature.
    ['a property value', '{"signer":"Decentraland-Kernel-Scene","sceneId":"QmAbC","isGuest":false}']
  ])('when the delivered metadata re-cases %s', (_case, delivered) => {
    it('should respond 401 and not call next', async () => {
      const { next, result, verification } = await run(requestWith(delivered))

      expect(result).toMatchObject({ status: 401, body: { ok: false } })
      expect((result as { body: { message: string } }).body.message).toContain('Invalid signature')
      expect(next).not.toHaveBeenCalled()
      expect(verification).toBeUndefined()
    })
  })

  describe('when the delivered metadata is exactly what was signed', () => {
    it('should call next and expose the metadata with its original casing', async () => {
      const { next, result, verification } = await run(requestWith(SIGNED))

      expect(result).toEqual({ status: 200, body: 'ok' })
      expect(next).toHaveBeenCalled()
      // Delivered verbatim: the middleware neither lowercases nor otherwise canonicalizes it.
      expect(verification).toEqual({
        auth: ownerAddress,
        authMetadata: { signer: 'decentraland-kernel-scene', sceneId: 'QmAbC', isGuest: false }
      })
    })
  })

  describe('when the metadata is re-cased and the middleware is optional', () => {
    it('should fall through unauthenticated rather than reject', async () => {
      const rewritten = '{"Signer":"decentraland-kernel-scene","sceneId":"QmAbC","isGuest":false}'
      const { next, result, verification } = await run(requestWith(rewritten), { optional: true })

      // Documented behavior for every verify() failure under `optional`: the request proceeds
      // anonymously. It cannot impersonate a user, but it is not rejected either.
      expect(result).toEqual({ status: 200, body: 'ok' })
      expect(next).toHaveBeenCalled()
      expect(verification).toBeUndefined()
    })
  })
})
