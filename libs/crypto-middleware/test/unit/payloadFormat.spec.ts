import { createPayload } from '../../src/verify'
import { PAYLOAD_VECTORS } from '../fixtures/payload-vectors'

// Pins this package to the shared wire format. decentraland-crypto-fetch pins the signing half
// against the same vectors, so neither side can change the format without the other failing.

describe('createPayload wire format', () => {
  describe.each(PAYLOAD_VECTORS.map((vector) => [vector.name, vector] as const))(
    'when building the payload for a request with %s',
    (_name, vector) => {
      let built: string

      beforeEach(() => {
        built = createPayload(vector.method, vector.path, vector.timestamp, vector.metadata)
      })

      it('should rebuild the shared payload vector', () => {
        expect(built).toBe(vector.payload)
      })
    }
  )
})
