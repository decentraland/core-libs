describe('package entry point', () => {
  describe('the default export', () => {
    let fetchMock: jest.MockedFunction<typeof fetch>
    let originalFetch: typeof globalThis.fetch

    beforeEach(() => {
      fetchMock = jest.fn().mockResolvedValue(new Response('ok')) as jest.MockedFunction<typeof fetch>
      originalFetch = globalThis.fetch
      globalThis.fetch = fetchMock
    })

    afterEach(() => {
      globalThis.fetch = originalFetch
      jest.resetModules()
    })

    describe('when called without an identity', () => {
      it('should delegate straight to the global fetch captured at module load', async () => {
        await jest.isolateModulesAsync(async () => {
          const mod = await import('../../src')
          const signedFetch = mod.default
          await signedFetch('https://service.example/api/resource')
          expect(fetchMock).toHaveBeenCalledTimes(1)
          expect(fetchMock).toHaveBeenCalledWith('https://service.example/api/resource', undefined)
        })
      })
    })
  })

  describe('the named exports', () => {
    it('should expose signedFetchFactory and signedHeaderFactory as functions', async () => {
      const mod = await import('../../src')
      expect(typeof mod.signedFetchFactory).toBe('function')
      expect(typeof mod.signedHeaderFactory).toBe('function')
    })
  })
})
