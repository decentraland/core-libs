import { getTokenIdAndAssetUrn, isExtendedUrn, parseUrn } from '../src'

describe('when calling isExtendedUrn', () => {
  it.each([
    ['a Collection V1 item', 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet:123', true],
    [
      'a Collection V2 item',
      'urn:decentraland:amoy:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a:0:1',
      true
    ],
    ['a Collection V1 asset', 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet', false],
    [
      'a Collection V2 asset',
      'urn:decentraland:amoy:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a:0',
      false
    ],
    ['a LAND URN', 'urn:decentraland:sepolia:LAND:-10,-13?atBlock=151231111', false],
    ['a V1 collection', 'urn:decentraland:ethereum:collections-v1:community_contest', false],
    ['a V2 collection', 'urn:decentraland:matic:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a', false]
  ])('should return %s when the URN is %s', async (_kind, urn, expected) => {
    const parsedUrn = await parseUrn(urn)
    expect(isExtendedUrn(parsedUrn)).toBe(expected)
  })
})

describe('when calling getTokenIdAndAssetUrn', () => {
  it.each([
    ['a Collection V1 item URN', 'urn:decentraland:ethereum:collections-v1:rtfkt_x_atari:p_rtfkt_x_atari_feet', '123'],
    [
      'a Collection V2 item URN',
      'urn:decentraland:amoy:collections-v2:0x02101c138653a0af06a45b729d9c5d6ba27b8f4a:0',
      '1'
    ]
  ])(
    'should split %s into the asset URN without the token id suffix and the extracted token id',
    (_kind, expectedAssetUrn, expectedTokenId) => {
      const result = getTokenIdAndAssetUrn(`${expectedAssetUrn}:${expectedTokenId}`)
      expect(result).toEqual({ assetUrn: expectedAssetUrn, tokenId: expectedTokenId })
    }
  )
})
