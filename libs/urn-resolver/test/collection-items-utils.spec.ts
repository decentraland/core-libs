import { DecentralandAssetIdentifier, getTokenIdAndAssetUrn, isExtendedUrn, parseUrn } from '../src'

describe('when calling isExtendedUrn', () => {
  let parsedUrn: DecentralandAssetIdentifier | null

  describe('and the URN is a Collection V1 item', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:123')
    })

    it('should return true', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(true)
    })
  })

  describe('and the URN is a Collection V2 item', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:amoy:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a:0:1')
    })

    it('should return true', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(true)
    })
  })

  describe('and the URN is a Collection V1 asset', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet')
    })

    it('should return false', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(false)
    })
  })

  describe('and the URN is a Collection V2 asset', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:amoy:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a:0')
    })

    it('should return false', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(false)
    })
  })

  describe('and the URN is a LAND URN', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:sepolia:LAND:-10,-13?atBlock=151231111')
    })

    it('should return false', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(false)
    })
  })

  describe('and the URN is a V1 collection', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:ethereum:collections-v1:community_contest')
    })

    it('should return false', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(false)
    })
  })

  describe('and the URN is a V2 collection', () => {
    beforeEach(async () => {
      parsedUrn = await parseUrn('urn:decentraland:matic:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a')
    })

    it('should return false', () => {
      expect(isExtendedUrn(parsedUrn)).toBe(false)
    })
  })
})

describe('when calling getTokenIdAndAssetUrn', () => {
  let expectedAssetUrn: string
  let expectedTokenId: string
  let result: { assetUrn: string; tokenId: string }

  describe('and splitting a Collection V1 item URN', () => {
    beforeEach(() => {
      expectedAssetUrn = 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet'
      expectedTokenId = '123'
      result = getTokenIdAndAssetUrn(`${expectedAssetUrn}:${expectedTokenId}`)
    })

    it('should return the asset URN without the token id suffix and the extracted token id', () => {
      expect(result).toEqual({ assetUrn: expectedAssetUrn, tokenId: expectedTokenId })
    })
  })

  describe('and splitting a Collection V2 item URN', () => {
    beforeEach(() => {
      expectedAssetUrn = 'urn:decentraland:amoy:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a:0'
      expectedTokenId = '1'
      result = getTokenIdAndAssetUrn(`${expectedAssetUrn}:${expectedTokenId}`)
    })

    it('should return the asset URN without the token id suffix and the extracted token id', () => {
      expect(result).toEqual({ assetUrn: expectedAssetUrn, tokenId: expectedTokenId })
    })
  })
})
