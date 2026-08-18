import type { AuthIdentity } from '@dcl/crypto'
import { AuthLinkType } from '@dcl/crypto'
import { AUTH_METADATA_HEADER, verify } from '@dcl/crypto-middleware'
import signedHeaderFactory from '../../src/signedHeaderFactory'

// Protocol conformance: what this package signs must verify under the official verifier. Both
// build the payload independently, so a drift in either one fails here rather than in production.

const identity: AuthIdentity = {
  ephemeralIdentity: {
    address: '0x84452bbFA4ca14B7828e2F3BBd106A2bD495CD34',
    publicKey:
      '0x0420c548d960b06dac035d1daf826472eded46b8b9d123294f1199c56fa235c89f2515158b1e3be0874bfb15b42d1551db8c276787a654d0b8d7b4d4356e70fe42',
    privateKey: '0xbc453a92d9baeb3d10294cbc1d48ef6738f718fd31b4eb8085efe7b311299399'
  },
  expiration: new Date('3021-10-16T22:32:29.626Z'),
  authChain: [
    { type: AuthLinkType.SIGNER, payload: '0x7949f9f239d1a0816ce5eb364a1f588ae9cc1bf5', signature: '' },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload: `Decentraland Login\nEphemeral address: 0x84452bbFA4ca14B7828e2F3BBd106A2bD495CD34\nExpiration: 3021-10-16T22:32:29.626Z`,
      signature:
        '0x39dd4ddf131ad2435d56c81c994c4417daef5cf5998258027ef8a1401470876a1365a6b79810dc0c4a2e9352befb63a9e4701d67b38007d83ffc4cd2b7a38ad51b'
    }
  ]
}

const ownerAddress = identity.authChain[0].payload.toLowerCase()
const method = 'POST'
const path = '/Scene/Resource'

// The camelCase shape explorer clients actually emit, with mixed-case values alongside.
const metadata = {
  signer: 'decentraland-kernel-scene',
  sceneId: 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
  isGuest: false,
  realm: { serverName: 'MyRealm', hostname: 'Realm.Example.Org' }
}

/** Signs `metadata` and flattens the resulting `Headers` into the record shape `verify()` takes. */
function sign(): Record<string, string> {
  const headers = signedHeaderFactory()(identity, method, path, metadata)
  const record: Record<string, string> = {}
  headers.forEach((value, key) => {
    record[key] = value
  })
  return record
}

describe('signedHeaderFactory verified through @dcl/crypto-middleware', () => {
  describe('when signing mixed-case metadata', () => {
    it('should verify and expose the metadata with keys and values case-intact', async () => {
      const result = await verify(method, path, sign())

      expect(result.auth).toBe(ownerAddress)
      // Delivered verbatim: no key or value is lowercased, trimmed or otherwise canonicalized.
      expect(result.authMetadata).toEqual(metadata)
      expect(Object.keys(result.authMetadata)).toEqual(['signer', 'sceneId', 'isGuest', 'realm'])
      expect(result.authMetadata.sceneId).toBe('QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG')
      expect((result.authMetadata.realm as { serverName: string }).serverName).toBe('MyRealm')
    })

    it('should verify regardless of the case the method and path are given in', async () => {
      const headers = sign()

      await expect(verify(method.toLowerCase(), path.toLowerCase(), headers)).resolves.toMatchObject({
        auth: ownerAddress
      })
    })
  })

  describe.each([
    ['a property name', '"sceneId"', '"sceneid"'],
    ['a reserved property name', '"signer"', '"Signer"'],
    ['a property value', '"MyRealm"', '"myrealm"']
  ])('when %s is re-cased after signing', (_case, from, to) => {
    it('should fail verification', async () => {
      const signed = sign()
      const rewritten = signed[AUTH_METADATA_HEADER].replace(from, to)
      // Guards the fixtures: a replace that matched nothing would make this pass vacuously.
      expect(rewritten).not.toBe(signed[AUTH_METADATA_HEADER])

      const delivered = { ...signed, [AUTH_METADATA_HEADER]: rewritten }
      await expect(verify(method, path, delivered)).rejects.toThrow('Invalid signature')
    })
  })
})
