import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { Authenticator } from '@dcl/crypto'
import { DELEGATION_PREFIX, buildClaimPayload, verifyDelegation, verifyStorageDelegation } from '../../src'

// A random account standing in for the authoritative root, and a throwaway
// ephemeral the worker would sign requests with.
const authoritative = createUnsafeIdentity()
const ephemeral = createUnsafeIdentity()
const TRUSTED = [authoritative.address.toLowerCase()]
const WORLD = 'boedo.dcl.eth'
const SCENE = 'bafkrei-scene'
const PARCEL = '5,7'

function encodeScope(payload: string, signer = authoritative): string {
  const signature = Authenticator.createSignature(signer, payload)
  return Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
}

function buildScopeHeader(
  params: {
    ephemeralAddress?: string
    world?: string
    sceneId?: string
    parcel?: string
    expiration?: number
    signer?: typeof authoritative
  } = {}
): string {
  const payload = buildClaimPayload({
    ephemeral: params.ephemeralAddress ?? ephemeral.address,
    world: params.world ?? WORLD,
    sceneId: params.sceneId ?? SCENE,
    parcel: params.parcel ?? PARCEL,
    expiration: params.expiration ?? Date.now() + 3_600_000
  })
  return encodeScope(payload, params.signer ?? authoritative)
}

// Verify against the "correct" target by default; override individual fields to
// simulate a request that doesn't match the claim.
function verify(
  header: string,
  target: Partial<{ signer: string; world: string; sceneId: string; parcel: string; trustedSigners: string[] }> = {}
) {
  return verifyDelegation(header, {
    signer: ephemeral.address,
    world: WORLD,
    sceneId: SCENE,
    parcel: PARCEL,
    trustedSigners: TRUSTED,
    ...target
  })
}

describe('verifyDelegation', () => {
  describe('when the delegation is valid', () => {
    it('authorizes the request', async () => {
      await expect(verify(buildScopeHeader())).resolves.toEqual({ ok: true })
    })

    it('is case-insensitive on the request signer and world', async () => {
      const result = await verify(buildScopeHeader(), {
        signer: ephemeral.address.toUpperCase(),
        world: WORLD.toUpperCase()
      })
      expect(result).toEqual({ ok: true })
    })

    it('is reachable under the pre-extraction name', async () => {
      await expect(
        verifyStorageDelegation(buildScopeHeader(), {
          signer: ephemeral.address,
          world: WORLD,
          sceneId: SCENE,
          parcel: PARCEL,
          trustedSigners: TRUSTED
        })
      ).resolves.toEqual({ ok: true })
    })
  })

  describe('when the claim binds a different ephemeral than the request signer', () => {
    it('rejects (prevents replaying a captured claim with another key)', async () => {
      const other = createUnsafeIdentity()
      const result = await verify(buildScopeHeader(), { signer: other.address })
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim world differs from the target world', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ world: 'other.dcl.eth' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim scene differs from the target scene', () => {
    it('rejects (confines a worker to its own scene, not the whole world)', async () => {
      const result = await verify(buildScopeHeader({ sceneId: 'bafkrei-other-scene' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim parcel differs from the target parcel', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ parcel: '99,99' }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the delegation has expired', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ expiration: Date.now() - 1_000 }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the claim is signed by an untrusted address', () => {
    it('rejects', async () => {
      const attacker = createUnsafeIdentity()
      const result = await verify(buildScopeHeader({ signer: attacker }))
      expect(result.ok).toBe(false)
    })
  })

  describe('when the header is malformed', () => {
    it('rejects non-base64 / non-JSON input', async () => {
      const result = await verify('not-base64-json')
      expect(result.ok).toBe(false)
    })

    it('rejects a JSON `null` payload without throwing', async () => {
      const header = Buffer.from('null', 'utf8').toString('base64')
      await expect(verify(header)).resolves.toEqual({ ok: false, reason: 'malformed scope header' })
    })

    it('rejects a JSON primitive/array payload', async () => {
      await expect(verify(Buffer.from('5', 'utf8').toString('base64'))).resolves.toEqual({
        ok: false,
        reason: 'malformed scope header'
      })
      await expect(verify(Buffer.from('[]', 'utf8').toString('base64'))).resolves.toMatchObject({ ok: false })
    })

    it('rejects an oversized header before decoding', async () => {
      const result = await verify('A'.repeat(5000))
      expect(result).toEqual({ ok: false, reason: 'scope header too large' })
    })

    it('rejects a claim with a duplicate field line', async () => {
      const payload = [
        DELEGATION_PREFIX,
        `Ephemeral: ${ephemeral.address.toLowerCase()}`,
        `World: ${WORLD}`,
        `SceneId: ${SCENE}`,
        'SceneId: bafkrei-evil',
        `Parcel: ${PARCEL}`,
        `Expiration: ${new Date(Date.now() + 3_600_000).toISOString()}`
      ].join('\n')
      expect((await verify(encodeScope(payload))).ok).toBe(false)
    })

    it('rejects a claim with an unknown/extra line', async () => {
      const payload = buildScopeHeaderPayloadWithExtraLine()
      expect((await verify(encodeScope(payload))).ok).toBe(false)
    })

    it('rejects a claim missing the domain-separation prefix', async () => {
      const payload = [
        `Ephemeral: ${ephemeral.address}`,
        `World: ${WORLD}`,
        `SceneId: ${SCENE}`,
        `Parcel: ${PARCEL}`
      ].join('\n')
      expect((await verify(encodeScope(payload))).ok).toBe(false)
    })
  })

  describe('when no trusted signers are configured', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader(), { trustedSigners: [] })
      expect(result.ok).toBe(false)
    })
  })
})

function buildScopeHeaderPayloadWithExtraLine(): string {
  return (
    buildClaimPayload({
      ephemeral: ephemeral.address,
      world: WORLD,
      sceneId: SCENE,
      parcel: PARCEL,
      expiration: Date.now() + 3_600_000
    }) + '\nExtra: injected'
  )
}
