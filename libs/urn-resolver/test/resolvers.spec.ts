import { resolveEthereumAsset } from '../src/resolvers'

describe('when calling resolveEthereumAsset', () => {
  describe('and resolving a LANDPROXY asset on ethereum', () => {
    it('should return the mainnet LAND proxy blockchain asset', async () => {
      const result = await resolveEthereumAsset(new URL('urn:decentraland:ethereum:LANDPROXY:0x1'), {
        contract: 'LANDPROXY',
        network: 'ethereum',
        tokenId: '0x1'
      })

      expect(result).toMatchObject({
        contractAddress: '0xf87e31492faf9a91b02ee0deaad50d51d56d5d4d',
        network: 'mainnet',
        blockchain: 'ethereum',
        type: 'blockchain-asset',
        id: '0x1'
      })
    })
  })
})
