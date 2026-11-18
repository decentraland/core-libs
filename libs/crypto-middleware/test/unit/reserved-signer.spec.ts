import type { IFetchComponent } from '@dcl/core-commons'
import { AuthLinkType } from '@dcl/crypto'
import type { AuthChain } from '@dcl/crypto'
import { verifyEIP1654Sign } from '../../src/verify'

describe('when verifying a contract-wallet chain through the catalyst', () => {
  let fetchMock: jest.Mock
  let fetcher: IFetchComponent
  let chain: AuthChain
  let payload: string

  beforeEach(() => {
    payload = 'post:/path:1:{}'
    fetchMock = jest.fn()
    fetcher = { fetch: fetchMock } as unknown as IFetchComponent
  })

  afterEach(() => {
    jest.resetAllMocks()
  })

  describe('and the signer is in the reserved address range', () => {
    let ownerAddress: string
    let error: unknown

    beforeEach(async () => {
      ownerAddress = '0x0000000000000000000000000000000000000001'
      chain = [
        { type: AuthLinkType.SIGNER, payload: ownerAddress, signature: '' },
        { type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, payload, signature: '0x' + 'ab'.repeat(100) }
      ]
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true, ownerAddress })
      })
      error = await verifyEIP1654Sign(chain, payload, { fetcher }).then(
        () => undefined,
        (err: unknown) => err
      )
    })

    it('should reject with a 401 Invalid signature error', () => {
      expect(error).toMatchObject({ statusCode: 401, message: 'Invalid signature' })
    })

    it('should not ask the catalyst', () => {
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
