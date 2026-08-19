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

describe('acceptLegacyPayload', () => {
  let fetcher: IFetchComponent

  beforeEach(() => {
    fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
  })

  describe('when the option is absent', () => {
    it('should refuse a legacy-signed request, which is the default posture', async () => {
      await expect(verify(method, path, legacySignedHeaders(), { fetcher })).rejects.toThrow('Invalid signature')
    })
  })

  describe('when the option is enabled with the keys the service authorizes on', () => {
    let result: Awaited<ReturnType<typeof verify>>
    let accepted: jest.Mock

    beforeEach(async () => {
      accepted = jest.fn()
      result = await verify(method, path, legacySignedHeaders(), {
        fetcher,
        acceptLegacyPayload: { canonicalMetadataKeys: SCENE_KEYS, onAccepted: accepted }
      })
    })

    it('should accept the request', () => {
      expect(result.auth).toBe(ownerAddress)
    })

    it('should hand consumers the metadata with its original casing, not the folded copy', () => {
      expect(result.authMetadata).toEqual(METADATA)
    })

    it('should report the acceptance so the rollout can be tracked', () => {
      expect(accepted).toHaveBeenCalledWith({ method, path })
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
            acceptLegacyPayload: { canonicalMetadataKeys: SCENE_KEYS }
          })
        ).rejects.toThrow('Invalid chain metadata')
      })
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
          acceptLegacyPayload: { canonicalMetadataKeys: SCENE_KEYS }
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
          acceptLegacyPayload: { canonicalMetadataKeys: SCENE_KEYS }
        })
      ).rejects.toThrow('Invalid metadata content')
    })
  })

  describe('when the option is enabled with no declared keys', () => {
    it('should throw a configuration error rather than accept unbound metadata', async () => {
      await expect(
        verify(method, path, legacySignedHeaders(), { fetcher, acceptLegacyPayload: { canonicalMetadataKeys: [] } })
      ).rejects.toThrow('requires a non-empty canonicalMetadataKeys list')
    })
  })

  describe('when a current-format request arrives while the option is enabled', () => {
    it('should verify on the strict path without consulting the legacy one', async () => {
      const timestamp = Date.now()
      const raw = JSON.stringify(METADATA)
      const payload = [method.toLowerCase(), path.toLowerCase(), String(timestamp), raw].join(':')
      const headers = createAuthChainHeaders(Authenticator.signPayload(identity, payload), timestamp, METADATA)
      headers[AUTH_METADATA_HEADER] = raw
      const accepted = jest.fn()

      await expect(
        verify(method, path, headers, {
          fetcher,
          acceptLegacyPayload: { canonicalMetadataKeys: SCENE_KEYS, onAccepted: accepted }
        })
      ).resolves.toMatchObject({ auth: ownerAddress })
      expect(accepted).not.toHaveBeenCalled()
    })
  })
})
