import { EthClient } from '../../src/eth/rpc'
import type { EthProvider } from '../../src/eth/rpc'

describe('EthClient', () => {
  describe('when the provider implements EIP-1193 request()', () => {
    it('should return the resolved result', async () => {
      const provider: EthProvider = { request: jest.fn().mockResolvedValue('0x10') }
      await expect(new EthClient(provider).eth_blockNumber()).resolves.toEqual('0x10')
      expect(provider.request).toHaveBeenCalledWith({ method: 'eth_blockNumber', params: [] })
    })

    it('should propagate a rejection', async () => {
      const provider: EthProvider = { request: jest.fn().mockRejectedValue(new Error('boom')) }
      await expect(new EthClient(provider).eth_blockNumber()).rejects.toThrow('boom')
    })
  })

  describe('when the provider implements callback-style sendAsync()', () => {
    it('should unwrap the JSON-RPC result', async () => {
      const provider: EthProvider = {
        sendAsync: (payload, callback) => callback(null, { result: '0x20' })
      }
      await expect(new EthClient(provider).eth_blockNumber()).resolves.toEqual('0x20')
    })

    it('should reject when the callback yields an error', async () => {
      const provider: EthProvider = {
        sendAsync: (_payload, callback) => callback(new Error('rpc down'))
      }
      await expect(new EthClient(provider).eth_blockNumber()).rejects.toThrow('rpc down')
    })

    it('should reject when the JSON-RPC envelope carries an error', async () => {
      const provider: EthProvider = {
        sendAsync: (_payload, callback) => callback(null, { error: { message: 'execution reverted' } })
      }
      await expect(new EthClient(provider).eth_blockNumber()).rejects.toThrow('execution reverted')
    })

    it('should send a well-formed JSON-RPC payload with incrementing ids', async () => {
      const seen: unknown[] = []
      const provider: EthProvider = {
        sendAsync: (payload, callback) => {
          seen.push(payload)
          callback(null, { result: '0x1' })
        }
      }
      const client = new EthClient(provider)
      await client.eth_blockNumber()
      await client.eth_blockNumber()
      expect(seen).toEqual([
        { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
        { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] }
      ])
    })
  })

  describe('when the provider returns a promise from sendAsync()', () => {
    it('should unwrap the resolved envelope', async () => {
      const provider = {
        sendAsync: jest.fn().mockResolvedValue({ result: '0x30' })
      } as unknown as EthProvider
      await expect(new EthClient(provider).eth_blockNumber()).resolves.toEqual('0x30')
    })
  })

  describe('when the provider only implements legacy send()', () => {
    it('should still work', async () => {
      const provider: EthProvider = {
        send: (_payload, callback) => callback(null, { result: '0x40' })
      }
      await expect(new EthClient(provider).eth_blockNumber()).resolves.toEqual('0x40')
    })
  })

  describe('when the provider is unusable', () => {
    it('should reject a provider with no transport method', async () => {
      await expect(new EthClient({} as EthProvider).eth_blockNumber()).rejects.toThrow(/request\(\)/)
    })

    it('should throw on construction for a non-object provider', () => {
      expect(() => new EthClient(undefined as unknown as EthProvider)).toThrow('Invalid provider')
    })
  })

  describe('when requesting a block', () => {
    it('should encode a numeric block as a hex quantity', async () => {
      const request = jest.fn().mockResolvedValue({ number: '0x10', timestamp: '0x20' })
      await new EthClient({ request }).eth_getBlockByNumber(4660, false)
      expect(request).toHaveBeenCalledWith({ method: 'eth_getBlockByNumber', params: ['0x1234', false] })
    })

    it('should pass a named tag through untouched', async () => {
      const request = jest.fn().mockResolvedValue({ number: '0x10', timestamp: '0x20' })
      await new EthClient({ request }).eth_getBlockByNumber('latest', false)
      expect(request).toHaveBeenCalledWith({ method: 'eth_getBlockByNumber', params: ['latest', false] })
    })
  })

  describe('when performing eth_call', () => {
    it('should send to/data and default to the latest block', async () => {
      const request = jest.fn().mockResolvedValue('0x1626ba7e')
      await new EthClient({ request }).eth_call('0xabc', '0xdata')
      expect(request).toHaveBeenCalledWith({
        method: 'eth_call',
        params: [{ to: '0xabc', data: '0xdata' }, 'latest']
      })
    })
  })
})
