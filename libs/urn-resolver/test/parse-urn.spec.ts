import { RFC2141 } from 'urn-lib'
import { parseUrn } from '../src'
import type {
  BlockchainCollectionThirdParty,
  BlockchainCollectionThirdPartyCollection,
  BlockchainCollectionThirdPartyItem,
  BlockchainCollectionThirdPartyName,
  DecentralandAssetIdentifier
} from '../src'

describe('when parsing a URN', () => {
  let urn: string
  let result: DecentralandAssetIdentifier | null

  describe('and the URN has an unknown scheme under urn:', () => {
    it('should return null', async () => {
      const result = await parseUrn('urn:test')
      expect(result).toBeNull()
    })
  })

  describe('and the URN is a LAND URN', () => {
    describe('and the network is sepolia with an atBlock query parameter', () => {
      it('should return the sepolia LAND asset with decoded x/y coordinates', async () => {
        const result = await parseUrn('urn:decentraland:sepolia:LAND:-10,-13?atBlock=151231111')
        expect(result).toMatchObject({
          blockchain: 'ethereum',
          contractAddress: '0x42f4ba48791e2de32f5fbf553441c2672864bb33',
          id: '0xfffffffffffffffffffffffffffffff6fffffffffffffffffffffffffffffff3',
          namespace: 'decentraland',
          network: 'sepolia',
          type: 'blockchain-asset',
          x: -10,
          y: -13
        })
      })
    })

    describe('and the URN carries a query string and a fragment', () => {
      it('should preserve the original URN as the uri property', async () => {
        const urn = 'urn:decentraland:sepolia:LAND:0x1?atBlock=151231111#4'
        const result = await parseUrn(urn)
        expect(result.uri.toString()).toEqual(urn)
      })
    })

    describe('and the network is sepolia with a hex token id', () => {
      it('should return the sepolia LAND asset with the hex id preserved', async () => {
        const result = await parseUrn('urn:decentraland:sepolia:LAND:0x1')
        expect(result).toMatchObject({
          contractAddress: '0x42f4ba48791e2de32f5fbf553441c2672864bb33',
          blockchain: 'ethereum',
          network: 'sepolia',
          id: '0x1'
        })
      })
    })

    describe('and the network is ETHEREUM in upper case', () => {
      it('should return the mainnet LAND asset', async () => {
        const result = await parseUrn('urn:decentraland:ETHEREUM:LAND:0x1')
        expect(result).toMatchObject({
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          blockchain: 'ethereum',
          network: 'mainnet',
          id: '0x1'
        })
      })
    })

    describe('and the LAND id is the coordinates 0,0', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:LAND:0,0'
        result = await parseUrn(urn)
      })

      it('should parse to the mainnet LAND at token id 0x0', () => {
        expect(result).toMatchObject({
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0x0'
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the LAND id is the URL-encoded coordinates 0,0', () => {
      beforeEach(async () => {
        urn = `urn:decentraland:ethereum:LAND:${encodeURIComponent('0,0')}`
        result = await parseUrn(urn)
      })

      it('should parse to the mainnet LAND at token id 0x0 with x=0 and y=0', () => {
        expect(result).toMatchObject({
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0x0',
          x: 0,
          y: 0
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the LAND id is the coordinates 13,-137', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:LAND:13,-137'
        result = await parseUrn(urn)
      })

      it('should parse to the mainnet LAND with the encoded hex token id and x/y', () => {
        expect(result).toMatchObject({
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0xdffffffffffffffffffffffffffffff77',
          x: 13,
          y: -137
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the LAND id is the hex token id 0xdffffffffffffffffffffffffffffff77', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:LAND:0xdffffffffffffffffffffffffffffff77'
        result = await parseUrn(urn)
      })

      it('should parse to the mainnet LAND with decoded coordinates 13,-137', () => {
        expect(result).toMatchObject({
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0xdffffffffffffffffffffffffffffff77',
          x: 13,
          y: -137
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the LAND id is the decimal token id 4763953136893138488487244504044754960247', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:LAND:4763953136893138488487244504044754960247'
        result = await parseUrn(urn)
      })

      it('should parse to the mainnet LAND with decoded coordinates 13,-137', () => {
        expect(result).toMatchObject({
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0xdffffffffffffffffffffffffffffff77',
          x: 13,
          y: -137
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is an off-chain URN', () => {
    describe('and the registry is static-portable-experiences', () => {
      it('should return the off-chain asset for the quest', async () => {
        const result = await parseUrn('urn:decentraland:off-chain:static-portable-experiences:quest-1')
        expect(result).toMatchObject({
          id: 'quest-1',
          registry: 'static-portable-experiences',
          type: 'off-chain'
        })
      })
    })

    describe('and the registry is base-avatars', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:off-chain:base-avatars:f_sweater'
        result = await parseUrn(urn)
      })

      it('should return the off-chain asset with the correct registry and id', () => {
        expect(result).toMatchObject({
          type: 'off-chain',
          id: 'f_sweater',
          registry: 'base-avatars'
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is a collections-v1 collection', () => {
    describe('and it is referenced by contract address', () => {
      it('should return the blockchain-collection-v1 asset on mainnet', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v1:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d'
        )
        expect(result).toMatchObject({
          type: 'blockchain-collection-v1',
          blockchain: 'ethereum',
          network: 'mainnet',
          id: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d'
        })
      })
    })

    describe('and it is referenced by a known collection name', () => {
      it('should resolve the collection to its contract address and keep the collection name', async () => {
        const result = await parseUrn('urn:decentraland:ethereum:collections-v1:community_contest')
        expect(result).toMatchObject({
          type: 'blockchain-collection-v1',
          blockchain: 'ethereum',
          network: 'mainnet',
          id: '0x32b7495895264ac9d0b12d32afd435453458b1c6',
          collectionName: 'community_contest'
        })
      })
    })
  })

  describe('and the URN is a collections-v1 asset', () => {
    describe('and it is referenced by contract address', () => {
      it('should return the blockchain-collection-v1-asset on mainnet with the provided id', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v1:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:test_name'
        )
        expect(result).toMatchObject({
          type: 'blockchain-collection-v1-asset',
          blockchain: 'ethereum',
          network: 'mainnet',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: 'test_name'
        })
      })
    })

    describe('and it is referenced by a known collection name', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v1:community_contest:cw_bell_attendant_hat'
        result = await parseUrn(urn)
      })

      it('should resolve the contract address while preserving the collection name and id', () => {
        expect(result).toMatchObject({
          type: 'blockchain-collection-v1-asset',
          blockchain: 'ethereum',
          network: 'mainnet',
          contractAddress: '0x32b7495895264ac9d0b12d32afd435453458b1c6',
          collectionName: 'community_contest',
          id: 'cw_bell_attendant_hat'
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and it is referenced by contract address matching a known collection', () => {
      beforeEach(async () => {
        urn =
          'urn:decentraland:ethereum:collections-v1:0x32b7495895264ac9d0b12d32afd435453458b1c6:cw_bell_attendant_hat'
        result = await parseUrn(urn)
      })

      it('should back-fill the collection name from the contract address', () => {
        expect(result).toMatchObject({
          contractAddress: '0x32b7495895264ac9d0b12d32afd435453458b1c6',
          collectionName: 'community_contest',
          id: 'cw_bell_attendant_hat'
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and it is referenced by a non-existent collection name', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v1:InExIsTeNtCoLlEcTiOn19283719:maddona-modern-life'
        result = await parseUrn(urn)
      })

      it('should return the asset with a null contract address and the collection name preserved', () => {
        expect(result).toMatchObject({
          contractAddress: null,
          collectionName: 'InExIsTeNtCoLlEcTiOn19283719',
          id: 'maddona-modern-life'
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is a collections-v1 item with a token id', () => {
    describe('and it is referenced by contract address', () => {
      it('should return the blockchain-collection-v1-item with the provided token id', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v1:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:test_name:456'
        )
        expect(result).toMatchObject({
          type: 'blockchain-collection-v1-item',
          blockchain: 'ethereum',
          network: 'mainnet',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: 'test_name',
          tokenId: '456'
        })
      })
    })

    describe('and it is referenced by a known collection name', () => {
      it('should resolve the contract address while preserving the collection name, id and token id', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v1:community_contest:cw_bell_attendant_hat:789'
        )
        expect(result).toMatchObject({
          type: 'blockchain-collection-v1-item',
          blockchain: 'ethereum',
          network: 'mainnet',
          contractAddress: '0x32b7495895264ac9d0b12d32afd435453458b1c6',
          collectionName: 'community_contest',
          id: 'cw_bell_attendant_hat',
          tokenId: '789'
        })
      })
    })
  })

  describe('and the URN is a collections-v2 collection', () => {
    it('should return the blockchain-collection-v2 asset on mainnet', async () => {
      const result = await parseUrn(
        'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d'
      )
      expect(result).toMatchObject({
        blockchain: 'ethereum',
        type: 'blockchain-collection-v2',
        network: 'mainnet',
        id: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d'
      })
    })
  })

  describe('and the URN is a collections-v2 asset', () => {
    describe('and the id is a non-numeric string', () => {
      it('should return null', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:test_name'
        )
        expect(result).toBeNull()
      })
    })

    describe('and the id is the decimal 0', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:0'
        result = await parseUrn(urn)
      })

      it('should return the blockchain-collection-v2-asset with id "0"', () => {
        expect(result).toMatchObject({
          blockchain: 'ethereum',
          type: 'blockchain-collection-v2-asset',
          network: 'mainnet',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0'
        })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the id is the hex 0x1', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:0x1'
        result = await parseUrn(urn)
      })

      it('should return the asset with id "0x1"', () => {
        expect(result).toMatchObject({ id: '0x1' })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the id is the hex 0x0', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:0x0'
        result = await parseUrn(urn)
      })

      it('should return the asset with id "0x0"', () => {
        expect(result).toMatchObject({ id: '0x0' })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the id is a large decimal number', () => {
      beforeEach(async () => {
        urn = 'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:123456789'
        result = await parseUrn(urn)
      })

      it('should return the asset with the decimal id preserved', () => {
        expect(result).toMatchObject({ id: '123456789' })
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the id is a large hex number', () => {
      beforeEach(async () => {
        urn =
          'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:0x000011111111111abcdef9087654321'
        result = await parseUrn(urn)
      })

      it('should return a non-null asset', () => {
        expect(result).not.toBeNull()
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })

  describe('and the URN is a collections-v2 item with a token id', () => {
    describe('and the token id is a positive integer', () => {
      it('should return the blockchain-collection-v2-item with the provided token id', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:0:123'
        )
        expect(result).toMatchObject({
          blockchain: 'ethereum',
          type: 'blockchain-collection-v2-item',
          network: 'mainnet',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '0',
          tokenId: '123'
        })
      })
    })

    describe('and the id and token id are both non-numeric', () => {
      it('should return null', async () => {
        const result = await parseUrn(
          'urn:decentraland:ethereum:collections-v2:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:test_name:abc'
        )
        expect(result).toBeNull()
      })
    })
  })

  describe('and the URN is a legacy dcl:// URL', () => {
    describe('and it points to a base-avatars wearable', () => {
      beforeEach(async () => {
        urn = 'dcl://base-avatars/eyes_03'
        result = await parseUrn(urn)
      })

      it('should return the corresponding off-chain asset', () => {
        expect(result).toMatchObject({
          id: 'eyes_03',
          namespace: 'decentraland',
          registry: 'base-avatars',
          type: 'off-chain'
        })
      })

      it('should generate a canonical urn:decentraland uri for it', () => {
        expect(result.uri.toString()).toEqual('urn:decentraland:off-chain:base-avatars:eyes_03')
      })
    })

    describe('and it points to a collections-v1 item', () => {
      beforeEach(async () => {
        urn = 'dcl://halloween_2019/bride_of_frankie_earring'
        result = await parseUrn(urn)
      })

      it('should return the corresponding blockchain-collection-v1-asset', () => {
        expect(result).toMatchObject({
          id: 'bride_of_frankie_earring',
          namespace: 'decentraland',
          collectionName: 'halloween_2019',
          type: 'blockchain-collection-v1-asset'
        })
      })

      it('should generate a canonical urn:decentraland uri for it', () => {
        expect(result.uri.toString()).toEqual(
          'urn:decentraland:ethereum:collections-v1:halloween_2019:bride_of_frankie_earring'
        )
      })
    })

    describe('and the path is empty (trailing slash only)', () => {
      it('should return null', async () => {
        const result = await parseUrn('dcl://base-avatars/')
        expect(result).toBeNull()
      })
    })

    describe('and the path has no segment after the host', () => {
      it('should return null', async () => {
        const result = await parseUrn('dcl://base-avatars')
        expect(result).toBeNull()
      })
    })

    describe('and the path has too many segments', () => {
      it('should return null', async () => {
        const result = await parseUrn('dcl://base-avatars/a/b/c')
        expect(result).toBeNull()
      })
    })

    describe('and it points to a valid legacy base-avatars wearable', () => {
      it.each([
        'dcl://base-avatars/f_sweater',
        'dcl://base-avatars/f_jeans',
        'dcl://base-avatars/bun_shoes',
        'dcl://base-avatars/standard_hair',
        'dcl://base-avatars/f_eyes_00',
        'dcl://base-avatars/f_eyebrows_00',
        'dcl://base-avatars/f_mouth_00'
      ])('should return a non-null parsed asset for %s', async (legacyUrn) => {
        expect(await parseUrn(legacyUrn)).toBeTruthy()
      })
    })
  })

  describe('and the URN uses the erc721 pattern', () => {
    describe('and the network is ethereum', () => {
      it('should return the mainnet blockchain-asset with uri preserved', async () => {
        const urn = 'urn:decentraland:ethereum:erc721:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:111111111111111111'
        const result = await parseUrn(urn)
        expect(result).toEqual({
          blockchain: 'ethereum',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '111111111111111111',
          namespace: 'decentraland',
          network: 'mainnet',
          type: 'blockchain-asset',
          uri: new URL(urn)
        })
      })
    })

    describe('and the network is sepolia', () => {
      it('should return the sepolia blockchain-asset with uri preserved', async () => {
        const urn = 'urn:decentraland:sepolia:erc721:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:111111111111111111'
        const result = await parseUrn(urn)
        expect(result).toEqual({
          blockchain: 'ethereum',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '111111111111111111',
          namespace: 'decentraland',
          network: 'sepolia',
          type: 'blockchain-asset',
          uri: new URL(urn)
        })
      })
    })

    describe('and the network is matic', () => {
      it('should return the matic blockchain-asset with uri preserved', async () => {
        const urn = 'urn:decentraland:matic:erc721:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:111111111111111111'
        const result = await parseUrn(urn)
        expect(result).toEqual({
          blockchain: 'ethereum',
          contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          id: '111111111111111111',
          namespace: 'decentraland',
          network: 'matic',
          type: 'blockchain-asset',
          uri: new URL(urn)
        })
      })
    })
  })

  describe('and the URN is a collections-v2 item on mainnet (sanity check)', () => {
    it('should return a non-null asset', async () => {
      const result = await parseUrn(
        'urn:decentraland:ethereum:collections-v2:0x1b8ba74cc34c2927aac0a8af9c3b1ba2e61352f2:0'
      )
      expect(result).toBeTruthy()
    })
  })

  describe('and the URN is a collections-thirdparty URN on amoy', () => {
    describe('and the URN targets a third party provider (name only)', () => {
      let expectedAsset: BlockchainCollectionThirdPartyName

      beforeEach(async () => {
        expectedAsset = {
          namespace: 'decentraland',
          uri: new URL('urn:decentraland:amoy:collections-thirdparty:aThirdParty'),
          blockchain: 'ethereum',
          network: 'amoy',
          contractAddress: '0x41e07f9d48586df0ac59a09a940ffdf4af306a13',
          type: 'blockchain-collection-third-party-name',
          thirdPartyName: 'aThirdParty'
        }
        urn = expectedAsset.uri.href
        result = await parseUrn(urn)
      })

      it('should return the third party name asset', () => {
        expect(result).toMatchObject(expectedAsset)
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the URN targets a third party collection', () => {
      let expectedAsset: BlockchainCollectionThirdPartyCollection

      beforeEach(async () => {
        expectedAsset = {
          namespace: 'decentraland',
          uri: new URL('urn:decentraland:amoy:collections-thirdparty:aThirdParty:summerCollection'),
          blockchain: 'ethereum',
          network: 'amoy',
          contractAddress: '0x41e07f9d48586df0ac59a09a940ffdf4af306a13',
          type: 'blockchain-collection-third-party-collection',
          thirdPartyName: 'aThirdParty',
          collectionId: 'summerCollection'
        }
        urn = expectedAsset.uri.href
        result = await parseUrn(urn)
      })

      it('should return the third party collection asset', () => {
        expect(result).toMatchObject(expectedAsset)
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the URN targets a third party item', () => {
      let expectedAsset: BlockchainCollectionThirdParty

      beforeEach(async () => {
        expectedAsset = {
          namespace: 'decentraland',
          uri: new URL('urn:decentraland:amoy:collections-thirdparty:aThirdParty:summerCollection:hat'),
          blockchain: 'ethereum',
          network: 'amoy',
          contractAddress: '0x41e07f9d48586df0ac59a09a940ffdf4af306a13',
          type: 'blockchain-collection-third-party',
          thirdPartyName: 'aThirdParty',
          collectionId: 'summerCollection',
          itemId: 'hat'
        }
        urn = expectedAsset.uri.href
        result = await parseUrn(urn)
      })

      it('should return the third party asset', () => {
        expect(result).toMatchObject(expectedAsset)
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })

    describe('and the URN targets a linked wearable third party item', () => {
      let expectedAsset: BlockchainCollectionThirdPartyItem

      beforeEach(async () => {
        expectedAsset = {
          namespace: 'decentraland',
          uri: new URL(
            'urn:decentraland:amoy:collections-thirdparty:aThirdParty:summerCollection:hat:sepolia:0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d:123456789'
          ),
          blockchain: 'ethereum',
          network: 'amoy',
          contractAddress: '0x41e07f9d48586df0ac59a09a940ffdf4af306a13',
          type: 'blockchain-collection-third-party-item',
          thirdPartyName: 'aThirdParty',
          collectionId: 'summerCollection',
          itemId: 'hat',
          nftChain: 'sepolia',
          nftContractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
          nftTokenId: '123456789'
        }
        urn = expectedAsset.uri.href
        result = await parseUrn(urn)
      })

      it('should return the third party linked wearable item', () => {
        expect(result).toMatchObject(expectedAsset)
      })

      it('should produce a URN that is valid per RFC2141', () => {
        expect(RFC2141.parse(urn)).toBeTruthy()
      })
    })
  })
})
