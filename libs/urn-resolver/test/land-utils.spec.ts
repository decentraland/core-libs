import { LandUtils } from '../src'

const cases: [tokenId: string, x: number, y: number][] = [
  ['0x0', 0, 0],
  ['115792089237316195423570985008687907853269984665640564039457584007913129639935', -1, -1],
  ['340282366920938463463374607431768211457', 1, 1],
  ['680564733841876926926749214863536422912', 2, 0],
  ['0x200000000000000000000000000000000', 2, 0],
  ['12250165209153784684681485867543655612403', 35, -13],
  ['680564733841876926926749214863536422877', 1, -35],
  ['4763953136893138488487244504044754960247', 13, -137],
  ['115792089237316195423570985008687907802567911994420732983414767500579666132842', -150, -150],
  ['115792089237316195423570985008687907802227629627499794519951392893147897921686', -150, 150],
  ['115792089237316195423570985008687907802908194361341671446878142108011434344299', -149, -149],
  ['51042355038140769519506191114765231718550', 150, 150]
]

describe('when encoding and decoding LAND token ids', () => {
  describe('when decoding a token id', () => {
    it.each(cases)(
      'should return the expected x and y coordinates for token id %s at (%i, %i)',
      (tokenId, x, y) => {
        expect(LandUtils.decodeTokenId(tokenId)).toEqual({ x: BigInt(x), y: BigInt(y) })
      }
    )
  })

  describe('when encoding coordinates', () => {
    it.each(cases)(
      'should return token id %s when encoding position (%i, %i)',
      (tokenId, x, y) => {
        expect(LandUtils.encodeTokenId(x, y)).toEqual(BigInt(tokenId))
      }
    )
  })
})
