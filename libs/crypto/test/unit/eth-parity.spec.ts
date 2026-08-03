import { getAddress as ecGetAddress, hexToBytes as ecHexToBytes, isHex as ecIsHex, toBigNumber } from 'eth-connect'
import { decodeMagicValue, encodeIsValidSignature } from '../../src/contracts/SignatureValidator'
import { getAddress, hexToBytes, isHex, toNumber } from '../../src/eth/hex'

// These helpers replaced eth-connect's implementations. eth-connect is kept as a
// devDependency purely so the replacements can be pinned against the originals.
describe('eth helper parity with eth-connect', () => {
  const addresses = [
    '4995daf087a13e83edc7ed9e37c43470ccff967b',
    '0x4995daf087a13e83edc7ed9e37c43470ccff967b',
    '0x4995dAF087a13E83EDC7eD9E37C43470CcFf967b',
    '0x0000000000000000000000000000000000000000',
    '0xffffffffffffffffffffffffffffffffffffffff',
    '0x3ea8147dabfe6818b0f8c1f8d756f4ad20321a65',
    '0x05ac0d29e42f9ae09b0efa250bd3385fc3d0a68b',
    '0xde0b295669a9fd93d5f28d9ec85e40f4cb697bae'
  ]

  describe('when checksumming addresses', () => {
    it.each(addresses)('should match eth-connect for %s', (address) => {
      expect(getAddress(address)).toEqual(ecGetAddress(address))
    })

    it.each(['abc', '0X4995DAF087A13E83EDC7ED9E37C43470CCFF967B', '', '0x123'])(
      'should reject %s just as eth-connect does',
      (bad) => {
        expect(() => getAddress(bad)).toThrow()
        expect(() => ecGetAddress(bad)).toThrow()
      }
    )
  })

  describe('when testing hex strings', () => {
    it.each(['0xdeadbeef', 'deadbeef', '0xDEADBEEF', '0x', '', '0xzz', '123', '0x0'])(
      'should match eth-connect for %s',
      (value) => {
        expect(isHex(value)).toEqual(ecIsHex(value))
      }
    )
  })

  describe('when decoding hex to bytes', () => {
    it.each(['0xdeadbeef', 'deadbeef', '0x0', '0x00', '0x1626ba7e', '0x' + 'ab'.repeat(65)])(
      'should match eth-connect for %s',
      (value) => {
        expect(Array.from(hexToBytes(value))).toEqual(Array.from(ecHexToBytes(value)))
      }
    )
  })

  describe('when coercing rpc quantities to numbers', () => {
    it.each(['0x10', '0x0', '16', '0xffffff', 0, 255])('should match eth-connect for %s', (value) => {
      expect(toNumber(value as string | number)).toEqual(toBigNumber(value).toNumber())
    })
  })
})

describe('isValidSignature ABI encoding', () => {
  const hash = new Uint8Array(32).fill(0xab)

  it('should encode the selector, hash, offset and padded signature', () => {
    const signature = new Uint8Array(65).fill(0x11)
    const encoded = encodeIsValidSignature(hash, signature)

    // selector for isValidSignature(bytes32,bytes)
    expect(encoded.slice(0, 10)).toEqual('0x1626ba7e')
    expect(encoded.slice(10, 74)).toEqual('ab'.repeat(32))
    // dynamic argument starts after the two head words
    expect(encoded.slice(74, 138)).toEqual((64).toString(16).padStart(64, '0'))
    expect(encoded.slice(138, 202)).toEqual((65).toString(16).padStart(64, '0'))
    // 65 bytes of signature padded up to 96
    expect((encoded.length - 202) / 2).toEqual(96)
  })

  it('should reject a hash that is not 32 bytes', () => {
    expect(() => encodeIsValidSignature(new Uint8Array(31), new Uint8Array(65))).toThrow(/32-byte hash/)
  })

  it('should decode the left-aligned bytes4 magic value', () => {
    expect(Array.from(decodeMagicValue('0x1626ba7e' + '00'.repeat(28)))).toEqual([0x16, 0x26, 0xba, 0x7e])
  })

  it('should reject a truncated return value', () => {
    expect(() => decodeMagicValue('0x1626')).toThrow(/expected at least 4/)
  })
})
