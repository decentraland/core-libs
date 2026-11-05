import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  createAuthChainHeaders
} from '../../src'
import { AuthLinkType } from '../../src/types'
import type { AuthChain } from '../../src/types'

describe('createAuthChainHeaders', () => {
  describe('when the chain has multiple links', () => {
    const chain: AuthChain = [
      { type: AuthLinkType.SIGNER, payload: '0x1', signature: '' },
      { type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL, payload: 'p1', signature: 's1' },
      { type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, payload: 'p2', signature: 's2' }
    ]

    it('should produce one AUTH_CHAIN_HEADER_PREFIX{i} entry per link, JSON-stringified', () => {
      const headers = createAuthChainHeaders(chain, 12345)

      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '0']).toBe(JSON.stringify(chain[0]))
      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '1']).toBe(JSON.stringify(chain[1]))
      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '2']).toBe(JSON.stringify(chain[2]))
    })
  })

  describe('when the chain has a single link', () => {
    const chain: AuthChain = [{ type: AuthLinkType.SIGNER, payload: '0x1', signature: '' }]

    it('should produce a single AUTH_CHAIN_HEADER_PREFIX0 entry', () => {
      const headers = createAuthChainHeaders(chain, 12345)

      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '0']).toBe(JSON.stringify(chain[0]))
      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '1']).toBeUndefined()
    })
  })

  describe('when a timestamp is provided', () => {
    const chain: AuthChain = [{ type: AuthLinkType.SIGNER, payload: '0x1', signature: '' }]

    it('should stringify it into the timestamp header', () => {
      const headers = createAuthChainHeaders(chain, 987654321)

      expect(headers[AUTH_TIMESTAMP_HEADER]).toBe('987654321')
    })
  })

  describe('when no metadata is provided', () => {
    const chain: AuthChain = [{ type: AuthLinkType.SIGNER, payload: '0x1', signature: '' }]

    it('should default metadata to an empty object', () => {
      const headers = createAuthChainHeaders(chain, 12345)

      expect(headers[AUTH_METADATA_HEADER]).toBe('{}')
    })
  })

  describe('when metadata is provided', () => {
    const chain: AuthChain = [{ type: AuthLinkType.SIGNER, payload: '0x1', signature: '' }]

    it('should JSON-stringify it into the metadata header', () => {
      const headers = createAuthChainHeaders(chain, 12345, { foo: 'bar', n: 1 })

      expect(headers[AUTH_METADATA_HEADER]).toBe(JSON.stringify({ foo: 'bar', n: 1 }))
    })
  })
})
