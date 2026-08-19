import type { IFetchComponent } from '@dcl/core-commons'
import { Authenticator } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import { rejectIfSigner } from '../../src/metadataValidators'
import { AUTH_METADATA_HEADER } from '../../src/types'
import verify from '../../src/verify'
import { identity, ownerAddress } from '../fixtures/identity'

// Drives the real verify() end to end. The fixtures below are the metadata explorer clients
// actually send — camelCase keys and mixed-case values — because that is the traffic this option
// exists to keep working while those clients still fold the payload.

const method = 'POST'
const path = '/get-scene-adapter'
const SCENE_KEYS = ['signer', 'intent', 'sceneId', 'realmName', 'realm.serverName']

const METADATA = {
  intent: 'dcl:explorer:comms-handshake',
  signer: 'dcl:explorer',
  isGuest: true,
  realm: { serverName: 'LocalPreview' },
  realmName: 'LocalPreview',
  sceneId: 'bafkreiAbC123'
}

/** How every deployed explorer signs today: the whole joined payload folded. */
function legacySignedHeaders(delivered?: string): Record<string, string> {
  const timestamp = Date.now()
  const raw = JSON.stringify(METADATA)
  const payload = [method, path, timestamp, raw].join(':').toLowerCase()
  const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, METADATA)
  headers[AUTH_METADATA_HEADER] = delivered ?? raw
  return headers
}

describe('canonicalMetadataKeys and the legacy payload', () => {
  let fetcher: IFetchComponent

  beforeEach(() => {
    fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
  })

  describe('when canonicalMetadataKeys is absent', () => {
    it('should refuse a legacy-signed request, which is the default posture', async () => {
      await expect(verify(method, path, legacySignedHeaders(), { fetcher })).rejects.toThrow('Invalid signature')
    })
  })

  describe('when the keys the service authorizes on are declared', () => {
    let result: Awaited<ReturnType<typeof verify>>

    beforeEach(async () => {
      result = await verify(method, path, legacySignedHeaders(), { fetcher, canonicalMetadataKeys: SCENE_KEYS })
    })

    it('should accept the request', () => {
      expect(result.auth).toBe(ownerAddress)
    })

    it('should hand consumers the metadata with its original casing, not the folded copy', () => {
      expect(result.authMetadata).toEqual(METADATA)
    })
  })

  describe('and a declared key is re-cased in the delivered metadata', () => {
    describe.each([
      ['a top-level key', '"sceneId"', '"sceneid"'],
      ['a reserved key', '"signer"', '"Signer"'],
      ['a nested key', '"serverName"', '"servername"']
    ])('when %s is re-spelled', (_case, from, to) => {
      it('should refuse it rather than accept metadata the signature does not pin', async () => {
        const delivered = JSON.stringify(METADATA).replace(from, to)
        expect(delivered).not.toBe(JSON.stringify(METADATA))

        await expect(
          verify(method, path, legacySignedHeaders(delivered), {
            fetcher,
            canonicalMetadataKeys: SCENE_KEYS
          })
        ).rejects.toThrow('Invalid chain metadata')
      })
    })
  })

  describe('and a declared path runs through an array of objects', () => {
    const ARRAY_KEYS = ['items.sceneId']
    const withItems = (items: unknown) => ({ ...METADATA, items })

    function signedWith(meta: Record<string, unknown>, delivered?: string): Record<string, string> {
      const timestamp = Date.now()
      const raw = JSON.stringify(meta)
      const payload = [method, path, timestamp, raw].join(':').toLowerCase()
      const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, meta)
      headers[AUTH_METADATA_HEADER] = delivered ?? raw
      return headers
    }

    it('should accept elements whose keys are canonical', async () => {
      const meta = withItems([{ sceneId: 'bafkreiAbC' }, { sceneId: 'bafkreiDeF' }])

      await expect(
        verify(method, path, signedWith(meta), { fetcher, canonicalMetadataKeys: ARRAY_KEYS })
      ).resolves.toMatchObject({ auth: ownerAddress })
    })

    it('should refuse an element whose key is re-cased, rather than skip the array', async () => {
      // Before array traversal this was accepted: the walk stopped at the array, so declaring
      // `items.sceneId` looked like protection and provided none.
      const meta = withItems([{ sceneId: 'bafkreiAbC' }])
      const delivered = JSON.stringify(meta).replace('"sceneId":"bafkreiAbC"', '"SceneId":"bafkreiAbC"')

      await expect(
        verify(method, path, signedWith(meta, delivered), { fetcher, canonicalMetadataKeys: ARRAY_KEYS })
      ).rejects.toThrow('Invalid chain metadata')
    })

    it('should check every element, not only the first', async () => {
      const meta = withItems([{ sceneId: 'bafkreiAbC' }, { sceneId: 'bafkreiDeF' }])
      const delivered = JSON.stringify(meta).replace('"sceneId":"bafkreiDeF"', '"SceneId":"bafkreiDeF"')

      await expect(
        verify(method, path, signedWith(meta, delivered), { fetcher, canonicalMetadataKeys: ARRAY_KEYS })
      ).rejects.toThrow('Invalid chain metadata')
    })

    it('should ignore an array holding no objects', async () => {
      const meta = withItems(['bafkreiAbC', 'bafkreiDeF'])

      await expect(
        verify(method, path, signedWith(meta), { fetcher, canonicalMetadataKeys: ARRAY_KEYS })
      ).resolves.toMatchObject({ auth: ownerAddress })
    })
  })

  describe('and an undeclared key is re-cased', () => {
    it('should accept it, since the service does not authorize on that field', async () => {
      // isGuest is deliberately not in SCENE_KEYS here. Stated as a test so the boundary of the
      // guarantee is explicit: it covers what the service declares, and nothing else.
      const delivered = JSON.stringify(METADATA).replace('"isGuest"', '"isguest"')

      await expect(
        verify(method, path, legacySignedHeaders(delivered), {
          fetcher,
          canonicalMetadataKeys: SCENE_KEYS
        })
      ).resolves.toMatchObject({ auth: ownerAddress })
    })
  })

  describe('and the metadataValidator refuses a re-cased value', () => {
    it('should never reach the legacy path, because the validator runs first', async () => {
      const recased = JSON.stringify({ ...METADATA, signer: 'DCL:Explorer' })

      await expect(
        verify(method, path, legacySignedHeaders(recased), {
          fetcher,
          metadataValidator: rejectIfSigner('decentraland-kernel-scene'),
          canonicalMetadataKeys: SCENE_KEYS
        })
      ).rejects.toThrow('Invalid metadata content')
    })
  })

  describe('and a declared key is delivered under two spellings at once', () => {
    describe.each([
      ['at the top level', '"signer":"dcl:explorer"', '"signer":"dcl:explorer","Signer":"other"'],
      ['nested', '"serverName":"LocalPreview"', '"serverName":"LocalPreview","servername":"other"']
    ])('when it is duplicated %s', (_case, from, to) => {
      it('should refuse it as ambiguous even though one spelling is canonical', async () => {
        // Both orderings fold to the same signed string, so which value the service reads depends
        // on key order rather than on anything the signature pinned.
        const delivered = JSON.stringify(METADATA).replace(from, to)
        expect(delivered).not.toBe(JSON.stringify(METADATA))

        await expect(
          verify(method, path, legacySignedHeaders(delivered), { fetcher, canonicalMetadataKeys: SCENE_KEYS })
        ).rejects.toThrow('Invalid chain metadata')
      })
    })
  })

  describe.each([
    ['a bare string, as JavaScript callers can pass', 'signer'],
    ['an array holding a non-string', [42]],
    ['an array holding an empty string', ['']],
    ['a path with an empty segment', ['realm..serverName']]
  ])('when canonicalMetadataKeys is %s', (_case, value) => {
    it('should throw a configuration error rather than silently skip the guard', async () => {
      // TypeScript would catch these; this package is published as JavaScript, so the runtime must.
      await expect(
        verify(method, path, legacySignedHeaders(), {
          fetcher,
          canonicalMetadataKeys: value as unknown as string[]
        })
      ).rejects.toThrow('canonicalMetadataKeys')
    })
  })

  describe('when the option is declared with no keys', () => {
    it('should throw a configuration error rather than accept unbound metadata', async () => {
      await expect(verify(method, path, legacySignedHeaders(), { fetcher, canonicalMetadataKeys: [] })).rejects.toThrow(
        'canonicalMetadataKeys must be a non-empty array'
      )
    })

    it('should throw even for a request that would have verified on the current format', async () => {
      // Validated up front, so a bad rollout config surfaces on the first request rather than on
      // the first one that happens to need the fallback.
      const timestamp = Date.now()
      const raw = JSON.stringify(METADATA)
      const payload = [method.toLowerCase(), path.toLowerCase(), String(timestamp), raw].join(':')
      const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, METADATA)
      headers[AUTH_METADATA_HEADER] = raw

      await expect(verify(method, path, headers, { fetcher, canonicalMetadataKeys: [] })).rejects.toThrow(
        'canonicalMetadataKeys must be a non-empty array'
      )
    })
  })

  describe('when a current-format request arrives while the option is enabled', () => {
    it('should verify on the strict path without consulting the legacy one', async () => {
      const timestamp = Date.now()
      const raw = JSON.stringify(METADATA)
      const payload = [method.toLowerCase(), path.toLowerCase(), String(timestamp), raw].join(':')
      const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, METADATA)
      headers[AUTH_METADATA_HEADER] = raw
      await expect(
        verify(method, path, headers, { fetcher, canonicalMetadataKeys: SCENE_KEYS })
      ).resolves.toMatchObject({ auth: ownerAddress })
    })
  })
})
