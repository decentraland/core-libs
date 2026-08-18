import type { AuthIdentity } from '@dcl/crypto'
import { AuthLinkType } from '@dcl/crypto'
import { AUTH_METADATA_HEADER, verify } from '@dcl/crypto-middleware'
import type { DecentralandSignatureData } from '@dcl/crypto-middleware'
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
  let signedHeaders: Record<string, string>

  beforeEach(() => {
    signedHeaders = sign()
  })

  describe('when the signed metadata is delivered unchanged', () => {
    let result: DecentralandSignatureData

    beforeEach(async () => {
      result = await verify(method, path, signedHeaders)
    })

    it('should resolve the auth chain to the signing address', () => {
      expect(result.auth).toBe(ownerAddress)
    })

    it('should expose the metadata exactly as it was signed', () => {
      expect(result.authMetadata).toEqual(metadata)
    })

    it('should keep the camelCase property names rather than folding them', () => {
      expect(Object.keys(result.authMetadata)).toEqual(['signer', 'sceneId', 'isGuest', 'realm'])
    })

    it('should keep the casing of nested property values', () => {
      expect((result.authMetadata.realm as { serverName: string }).serverName).toBe('MyRealm')
    })

    describe('and the verifier is given the method and path already lowercased', () => {
      let lowercased: DecentralandSignatureData

      beforeEach(async () => {
        lowercased = await verify(method.toLowerCase(), path.toLowerCase(), signedHeaders)
      })

      it('should resolve to the same signing address', () => {
        expect(lowercased.auth).toBe(ownerAddress)
      })
    })
  })

  describe.each([
    ['a property name', '"sceneId"', '"sceneid"'],
    ['a reserved property name', '"signer"', '"Signer"'],
    ['a property value', '"MyRealm"', '"myrealm"']
  ])('when %s is re-cased after signing', (_case, from, to) => {
    let delivered: Record<string, string>

    beforeEach(() => {
      delivered = { ...signedHeaders, [AUTH_METADATA_HEADER]: signedHeaders[AUTH_METADATA_HEADER].replace(from, to) }
    })

    it('should deliver metadata bytes that differ from the signed ones', () => {
      // Guards the fixtures: a replace that matched nothing would make the next case pass vacuously.
      expect(delivered[AUTH_METADATA_HEADER]).not.toBe(signedHeaders[AUTH_METADATA_HEADER])
    })

    it('should reject with an Invalid signature error', async () => {
      await expect(verify(method, path, delivered)).rejects.toThrow('Invalid signature')
    })
  })
})
