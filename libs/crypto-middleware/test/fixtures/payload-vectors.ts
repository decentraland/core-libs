/**
 * Signed-payload vectors for the Decentraland signed-fetch wire format.
 *
 * `decentraland-crypto-fetch` builds this payload to sign; `@dcl/crypto-middleware` rebuilds it to
 * verify. The two packages share no code on purpose — neither depends on the other — so this file
 * is duplicated verbatim at:
 *
 *   libs/crypto-fetch/test/fixtures/payload-vectors.ts
 *   libs/crypto-middleware/test/fixtures/payload-vectors.ts
 *
 * Both copies must be kept identical. If you change the payload format, both packages fail here
 * until each is updated, which is what makes the drift visible.
 *
 * The format: method, path and timestamp lowercased, metadata joined verbatim. The metadata bytes
 * are covered by the signature, so a property name or value that differs from what was signed no
 * longer verifies.
 */
export interface PayloadVector {
  name: string
  method: string
  path: string
  timestamp: string
  metadata: string
  payload: string
}

/** Fixed so the vectors below can hardcode it; signers mock `Date.now` to match. */
export const TIMESTAMP = '1700000000000'

export const PAYLOAD_VECTORS: PayloadVector[] = [
  {
    name: 'empty metadata',
    method: 'GET',
    path: '/anything',
    timestamp: TIMESTAMP,
    metadata: '{}',
    payload: 'get:/anything:1700000000000:{}'
  },
  {
    name: 'an uppercase method and a mixed-case path',
    method: 'POST',
    path: '/Scene/Resource',
    timestamp: TIMESTAMP,
    metadata: '{}',
    payload: 'post:/scene/resource:1700000000000:{}'
  },
  {
    name: 'camelCase property names',
    method: 'GET',
    path: '/r',
    timestamp: TIMESTAMP,
    metadata: '{"sceneId":"QmAbC","isGuest":false}',
    payload: 'get:/r:1700000000000:{"sceneId":"QmAbC","isGuest":false}'
  },
  {
    name: 'a mixed-case value nested in an object',
    method: 'GET',
    path: '/r',
    timestamp: TIMESTAMP,
    metadata: '{"realm":{"serverName":"MyRealm"}}',
    payload: 'get:/r:1700000000000:{"realm":{"serverName":"MyRealm"}}'
  },
  {
    name: 'a reserved property name that must not be folded',
    method: 'GET',
    path: '/r',
    timestamp: TIMESTAMP,
    metadata: '{"signer":"decentraland-kernel-scene"}',
    payload: 'get:/r:1700000000000:{"signer":"decentraland-kernel-scene"}'
  }
]
