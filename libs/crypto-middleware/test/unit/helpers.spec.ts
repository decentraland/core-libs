import type { IFetchComponent } from '@well-known-components/interfaces'
import { AuthLinkType } from '@dcl/crypto'
import type { AuthChain } from '@dcl/crypto'
import createAuthChainHeaders from '../../src/createAuthChainHeaders'
import RequestError from '../../src/errors'
import {
  AUTH_CHAIN_HEADER_PREFIX,
  AUTH_METADATA_HEADER,
  AUTH_TIMESTAMP_HEADER,
  DEFAULT_EXPIRATION
} from '../../src/types'
import {
  createPayload,
  extractAuthChain,
  verifyExpiration,
  verifyMetadata,
  verifySign,
  verifyTimestamp
} from '../../src/verify'

describe('RequestError', () => {
  describe('when constructed with a message and a status code', () => {
    it('should expose name, message and statusCode', () => {
      const err = new RequestError('boom', 418)
      expect(err.name).toBe('RequestError')
      expect(err.message).toBe('boom')
      expect(err.statusCode).toBe(418)
      expect(err).toBeInstanceOf(Error)
    })
  })

  describe('when constructed without a status code', () => {
    it('should default statusCode to 500', () => {
      expect(new RequestError('boom').statusCode).toBe(500)
    })
  })
})

describe('extractAuthChain', () => {
  describe('when the headers contain two valid chain entries', () => {
    it('should return the parsed chain in order', () => {
      const headers = {
        [AUTH_CHAIN_HEADER_PREFIX + '0']: '{"type":"SIGNER","payload":"0x1","signature":""}',
        [AUTH_CHAIN_HEADER_PREFIX + '1']: '{"type":"ECDSA_SIGNED_ENTITY","payload":"p","signature":"s"}'
      }
      expect(extractAuthChain(headers)).toEqual([
        { type: 'SIGNER', payload: '0x1', signature: '' },
        { type: 'ECDSA_SIGNED_ENTITY', payload: 'p', signature: 's' }
      ])
    })
  })

  describe('when a header value is an array', () => {
    it('should use the first element', () => {
      const headers = {
        [AUTH_CHAIN_HEADER_PREFIX + '0']: ['{"type":"SIGNER","payload":"0x1","signature":""}', 'ignored'],
        [AUTH_CHAIN_HEADER_PREFIX + '1']: '{"type":"E","payload":"p","signature":"s"}'
      }
      expect(extractAuthChain(headers)).toHaveLength(2)
    })
  })

  describe('when a chain header is malformed JSON', () => {
    it('should throw an Invalid chain format error', () => {
      const headers = { [AUTH_CHAIN_HEADER_PREFIX + '0']: '{' }
      expect(() => extractAuthChain(headers)).toThrow('Invalid chain format')
    })
  })

  describe('when a chain header parses to null', () => {
    it('should throw an Invalid chain format error', () => {
      const headers = {
        [AUTH_CHAIN_HEADER_PREFIX + '0']: 'null',
        [AUTH_CHAIN_HEADER_PREFIX + '1']: '{"type":"ECDSA_SIGNED_ENTITY","payload":"p","signature":"s"}'
      }
      expect(() => extractAuthChain(headers)).toThrow(/malformed auth link/)
    })
  })

  describe('when a chain header parses to a primitive', () => {
    it('should throw an Invalid chain format error', () => {
      const headers = {
        [AUTH_CHAIN_HEADER_PREFIX + '0']: '42',
        [AUTH_CHAIN_HEADER_PREFIX + '1']: '{"type":"ECDSA_SIGNED_ENTITY","payload":"p","signature":"s"}'
      }
      expect(() => extractAuthChain(headers)).toThrow(/malformed auth link/)
    })
  })

  describe('when a chain header parses to an object missing expected fields', () => {
    it('should throw an Invalid chain format error', () => {
      const headers = {
        [AUTH_CHAIN_HEADER_PREFIX + '0']: '{"type":"SIGNER","payload":"0x1"}',
        [AUTH_CHAIN_HEADER_PREFIX + '1']: '{"type":"ECDSA_SIGNED_ENTITY","payload":"p","signature":"s"}'
      }
      expect(() => extractAuthChain(headers)).toThrow(/malformed auth link/)
    })
  })

  describe('when only a single chain entry is present', () => {
    it('should throw an Invalid Auth Chain error', () => {
      const headers = { [AUTH_CHAIN_HEADER_PREFIX + '0']: '{"type":"SIGNER","payload":"0x1","signature":""}' }
      expect(() => extractAuthChain(headers)).toThrow('Invalid Auth Chain')
    })
  })

  describe('when no chain headers are present', () => {
    it('should throw an Invalid Auth Chain error', () => {
      expect(() => extractAuthChain({})).toThrow('Invalid Auth Chain')
    })
  })

  describe('when the number of chain headers exceeds the default maximum', () => {
    it('should throw an Auth chain exceeds maximum length error', () => {
      const headers: Record<string, string> = {}
      for (let i = 0; i <= 10; i++) {
        headers[AUTH_CHAIN_HEADER_PREFIX + i] = '{"type":"SIGNER","payload":"0x1","signature":""}'
      }
      expect(() => extractAuthChain(headers)).toThrow('Auth chain exceeds maximum length of 10')
    })
  })

  describe('when the number of chain headers equals the default maximum', () => {
    it('should accept the chain without throwing', () => {
      const headers: Record<string, string> = {}
      for (let i = 0; i < 10; i++) {
        headers[AUTH_CHAIN_HEADER_PREFIX + i] = '{"type":"SIGNER","payload":"0x1","signature":""}'
      }
      expect(extractAuthChain(headers)).toHaveLength(10)
    })
  })

  describe('when a custom maxChainLength is provided', () => {
    it('should honor the lower cap', () => {
      const headers: Record<string, string> = {}
      for (let i = 0; i < 5; i++) {
        headers[AUTH_CHAIN_HEADER_PREFIX + i] = '{"type":"SIGNER","payload":"0x1","signature":""}'
      }
      expect(() => extractAuthChain(headers, 3)).toThrow('Auth chain exceeds maximum length of 3')
    })
  })

  describe('when a chain header arrives as a multi-valued array', () => {
    it('should use the first value', () => {
      const headers = {
        [AUTH_CHAIN_HEADER_PREFIX + '0']: ['{"type":"SIGNER","payload":"0x1","signature":""}', 'ignored'],
        [AUTH_CHAIN_HEADER_PREFIX + '1']: '{"type":"ECDSA_SIGNED_ENTITY","payload":"p","signature":"s"}'
      }
      const chain = extractAuthChain(headers)
      expect(chain[0].payload).toBe('0x1')
    })
  })
})

describe('verifyTimestamp', () => {
  describe('when the value is a numeric string', () => {
    it('should return the numeric value', () => {
      expect(verifyTimestamp('12345')).toBe(12345)
    })
  })

  describe('when the value is undefined', () => {
    it('should return 0', () => {
      expect(verifyTimestamp(undefined)).toBe(0)
    })
  })

  describe('when the value is a single-element array', () => {
    it('should return the numeric value', () => {
      expect(verifyTimestamp(['12345'])).toBe(12345)
    })
  })

  describe('when the value is not numeric', () => {
    it('should throw an Invalid chain timestamp error', () => {
      expect(() => verifyTimestamp('abc')).toThrow('Invalid chain timestamp')
    })
  })

  describe('when the value is a multi-element array', () => {
    it('should use the first element', () => {
      expect(verifyTimestamp(['1', '2'])).toBe(1)
    })
  })
})

describe('verifyMetadata', () => {
  describe('when the value is a valid JSON object', () => {
    it('should return the parsed object', () => {
      expect(verifyMetadata('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' })
    })
  })

  describe('when the value is undefined', () => {
    it('should return an empty object', () => {
      expect(verifyMetadata(undefined)).toEqual({})
    })
  })

  describe('when the value is malformed JSON', () => {
    it('should throw an Invalid chain metadata error', () => {
      expect(() => verifyMetadata('{')).toThrow('Invalid chain metadata')
    })
  })

  describe('when the value is a JSON primitive', () => {
    it('should throw an Invalid chain metadata error', () => {
      expect(() => verifyMetadata('42')).toThrow('Invalid chain metadata')
    })
  })

  describe('when the value is a JSON array', () => {
    it('should throw an Invalid chain metadata error', () => {
      expect(() => verifyMetadata('[1,2]')).toThrow('Invalid chain metadata')
    })
  })

  describe('when the value is null', () => {
    it('should throw an Invalid chain metadata error', () => {
      expect(() => verifyMetadata('null')).toThrow('Invalid chain metadata')
    })
  })

  describe('when the value is a multi-element array', () => {
    it('should only consider the first element', () => {
      expect(verifyMetadata(['{"a":1}', 'ignored'])).toEqual({ a: 1 })
    })
  })

  describe('when the attacker-supplied value is longer than the truncation cap', () => {
    it('should truncate the echoed bytes in the error message', () => {
      const long = 'x'.repeat(200)
      try {
        verifyMetadata(long)
        fail('should have thrown')
      } catch (err) {
        expect(err).toBeInstanceOf(Error)
        const message = (err as Error).message
        expect(message.length).toBeLessThan(long.length)
        expect(message).toContain('…')
      }
    })
  })
})

describe('verifyExpiration', () => {
  describe('when the timestamp is within the expiration window', () => {
    it('should not throw', () => {
      expect(() => verifyExpiration(Date.now())).not.toThrow()
    })
  })

  describe('when the timestamp is beyond the default expiration window', () => {
    it('should throw an Expired signature error', () => {
      expect(() => verifyExpiration(Date.now() - DEFAULT_EXPIRATION - 1000)).toThrow('Expired signature')
    })
  })

  describe('when a custom expiration value is provided', () => {
    it('should apply the custom window', () => {
      expect(() => verifyExpiration(Date.now() - 100, { expiration: 50 })).toThrow('Expired signature')
    })
  })

  describe('when the timestamp is more than one expiration window in the future', () => {
    it('should throw a too far in the future error', () => {
      expect(() => verifyExpiration(Date.now() + 2 * DEFAULT_EXPIRATION)).toThrow('too far in the future')
    })
  })

  describe('when the timestamp is close to Number.MAX_VALUE', () => {
    it('should reject instead of accepting a signature that never expires', () => {
      expect(() => verifyExpiration(Number.MAX_VALUE)).toThrow('too far in the future')
    })
  })

  describe('when the timestamp is slightly in the future within the expiration window', () => {
    it('should accept the signature', () => {
      expect(() => verifyExpiration(Date.now() + 1000, { expiration: 60000 })).not.toThrow()
    })
  })
})

describe('createPayload', () => {
  describe('when all values are provided', () => {
    it('should join method, path, timestamp and metadata with colons and lowercase the result', () => {
      expect(createPayload('GET', '/Path', '123', '{}')).toBe('get:/path:123:{}')
    })
  })

  describe('when some values are undefined', () => {
    it('should treat undefined values as empty strings', () => {
      expect(createPayload('get', '/p', undefined, '{}')).toBe('get:/p::{}')
    })
  })

  describe('when a header value arrives as a multi-valued array', () => {
    it('should use only the first value for the payload', () => {
      expect(createPayload('get', '/p', ['123', 'extra'], '{}')).toBe('get:/p:123:{}')
    })
  })
})

describe('createAuthChainHeaders', () => {
  const chain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: '0x1', signature: '' },
    { type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY, payload: 'p', signature: 's' }
  ]

  describe('when a metadata value is not provided', () => {
    it('should default to an empty object', () => {
      const headers = createAuthChainHeaders(chain, 12345)
      expect(headers[AUTH_METADATA_HEADER]).toBe('{}')
      expect(headers[AUTH_TIMESTAMP_HEADER]).toBe('12345')
      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '0']).toBe(JSON.stringify(chain[0]))
      expect(headers[AUTH_CHAIN_HEADER_PREFIX + '1']).toBe(JSON.stringify(chain[1]))
    })
  })

  describe('when a metadata value is provided', () => {
    it('should serialize it into the metadata header', () => {
      const headers = createAuthChainHeaders(chain, 12345, { foo: 'bar' })
      expect(headers[AUTH_METADATA_HEADER]).toBe('{"foo":"bar"}')
    })
  })
})

describe('verifySign', () => {
  const personalChain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: '0x1', signature: '' },
    { type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL, payload: 'p', signature: 's' }
  ]
  const eip1654Chain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: '0x1', signature: '' },
    { type: AuthLinkType.ECDSA_EIP_1654_EPHEMERAL, payload: 'p', signature: 's' },
    { type: AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY, payload: 'p', signature: 's' }
  ]

  describe('when the chain is a personal signature chain', () => {
    it('should delegate to verifyPersonalSign (no fetcher call)', async () => {
      const fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
      await expect(verifySign(personalChain, 'payload', { fetcher })).rejects.toThrow('Invalid signature')
      expect(fetcher.fetch).not.toHaveBeenCalled()
    })
  })

  describe('when the chain is an EIP-1654 chain', () => {
    it('should delegate to verifyEIP1654Sign and hit the catalyst', async () => {
      const fetcher = { fetch: jest.fn() } as unknown as IFetchComponent
      ;(fetcher.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ valid: true, ownerAddress: '0x1' })
      })

      await expect(verifySign(eip1654Chain, 'payload', { fetcher })).resolves.toBe('0x1')
      expect(fetcher.fetch).toHaveBeenCalled()
    })
  })
})
