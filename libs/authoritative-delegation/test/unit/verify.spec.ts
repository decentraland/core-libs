import { createUnsafeIdentity } from '@dcl/crypto/dist/crypto'
import { Authenticator } from '@dcl/crypto'
import {
  DEFAULT_MAX_TTL_MS,
  DELEGATION_PREFIX,
  MAX_SCOPE_HEADER_LENGTH,
  buildClaimPayload,
  verifyDelegation
} from '../../src'

// A random account standing in for the authoritative root, and a throwaway
// ephemeral the worker would sign requests with.
const authoritative = createUnsafeIdentity()
const ephemeral = createUnsafeIdentity()
const TRUSTED = [authoritative.address.toLowerCase()]
const AUDIENCE = 'badges'
const WORLD = 'boedo.dcl.eth'
const SCENE = 'bafkrei-scene'
const PARCEL = '5,7'
const HOUR = 3_600_000

function encodeScope(payload: string, signer = authoritative): string {
  const signature = Authenticator.createSignature(signer, payload)
  return Buffer.from(JSON.stringify({ payload, signature }), 'utf8').toString('base64')
}

function buildPayload(
  params: {
    audience?: string
    ephemeralAddress?: string
    world?: string
    sceneId?: string
    parcel?: string
    expiration?: number
  } = {}
): string {
  return buildClaimPayload({
    audience: params.audience ?? AUDIENCE,
    ephemeral: params.ephemeralAddress ?? ephemeral.address,
    world: params.world ?? WORLD,
    sceneId: params.sceneId ?? SCENE,
    parcel: params.parcel ?? PARCEL,
    expiration: params.expiration ?? Date.now() + HOUR
  })
}

function buildScopeHeader(params: Parameters<typeof buildPayload>[0] & { signer?: typeof authoritative } = {}): string {
  return encodeScope(buildPayload(params), params.signer ?? authoritative)
}

// Verify against the "correct" target by default; override individual fields to
// simulate a request that doesn't match the claim.
function verify(
  header: string | string[] | undefined,
  target: Partial<{
    audience: string
    signer: string
    world: string
    sceneId: string
    parcel: string
    trustedSigners: string[]
    maxTtlMs: number
  }> = {}
) {
  return verifyDelegation(header, {
    audience: AUDIENCE,
    signer: ephemeral.address,
    world: WORLD,
    sceneId: SCENE,
    parcel: PARCEL,
    trustedSigners: TRUSTED,
    ...target
  })
}

describe('verifyDelegation', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

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

    it('authorizes a claim signed by any of several trusted signers', async () => {
      const otherRoot = createUnsafeIdentity()
      const result = await verify(buildScopeHeader(), {
        trustedSigners: [otherRoot.address.toLowerCase(), ...TRUSTED]
      })
      expect(result).toEqual({ ok: true })
    })

    it('accepts a header of exactly MAX_SCOPE_HEADER_LENGTH', async () => {
      const payload = buildPayload()
      const signature = Authenticator.createSignature(authoritative, payload)
      // 3 bytes encode to 4 base64 chars; pad the JSON with trailing whitespace
      // (which JSON.parse ignores) to land exactly on the limit.
      const json = JSON.stringify({ payload, signature }).padEnd((MAX_SCOPE_HEADER_LENGTH / 4) * 3, ' ')
      const header = Buffer.from(json, 'utf8').toString('base64')
      expect(header).toHaveLength(MAX_SCOPE_HEADER_LENGTH)
      await expect(verify(header)).resolves.toEqual({ ok: true })
    })

    it('authorizes a claim within maxTtlMs', async () => {
      const result = await verify(buildScopeHeader({ expiration: Date.now() + HOUR }), { maxTtlMs: 2 * HOUR })
      expect(result).toEqual({ ok: true })
    })

    it('authorizes a claim expiring exactly at maxTtlMs', async () => {
      const now = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(now)
      const result = await verify(buildScopeHeader({ expiration: now + HOUR }), { maxTtlMs: HOUR })
      expect(result).toEqual({ ok: true })
    })
  })

  describe('when the claim is for another audience', () => {
    it('rejects (a storage claim never authorizes badges)', async () => {
      const result = await verify(buildScopeHeader({ audience: 'storage' }))
      expect(result).toEqual({ ok: false, reason: 'claim audience does not match this service' })
    })
  })

  describe('when the claim is a v1 storage claim', () => {
    it('rejects it as unparseable', async () => {
      const payload = [
        'Decentraland Authoritative Storage Delegation',
        `Ephemeral: ${ephemeral.address.toLowerCase()}`,
        `World: ${WORLD}`,
        `SceneId: ${SCENE}`,
        `Parcel: ${PARCEL}`,
        `Expiration: ${new Date(Date.now() + HOUR).toISOString()}`
      ].join('\n')
      await expect(verify(encodeScope(payload))).resolves.toEqual({ ok: false, reason: 'unparseable claim' })
    })
  })

  describe('when the claim expires further out than maxTtlMs', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ expiration: Date.now() + 365 * 24 * HOUR }), {
        maxTtlMs: HOUR
      })
      expect(result).toEqual({ ok: false, reason: 'delegation lifetime exceeds maxTtlMs' })
    })
  })

  describe('when maxTtlMs is not set', () => {
    it('caps the lifetime at DEFAULT_MAX_TTL_MS', async () => {
      const now = Date.now()
      jest.spyOn(Date, 'now').mockReturnValue(now)
      await expect(verify(buildScopeHeader({ expiration: now + DEFAULT_MAX_TTL_MS }))).resolves.toEqual({ ok: true })
      await expect(verify(buildScopeHeader({ expiration: now + DEFAULT_MAX_TTL_MS + 1 }))).resolves.toEqual({
        ok: false,
        reason: 'delegation lifetime exceeds maxTtlMs'
      })
    })
  })

  describe('when maxTtlMs is not a finite positive number', () => {
    it.each([NaN, Infinity, 0, -1])('rejects every claim for %p (fails closed)', async (maxTtlMs) => {
      await expect(verify(buildScopeHeader(), { maxTtlMs })).resolves.toEqual({
        ok: false,
        reason: 'invalid maxTtlMs'
      })
    })
  })

  describe('when the claim binds a different ephemeral than the request signer', () => {
    it('rejects (prevents replaying a captured claim with another key)', async () => {
      const other = createUnsafeIdentity()
      const result = await verify(buildScopeHeader(), { signer: other.address })
      expect(result).toEqual({ ok: false, reason: 'claim ephemeral does not match request signer' })
    })
  })

  describe('when the claim world differs from the target world', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ world: 'other.dcl.eth' }))
      expect(result).toEqual({ ok: false, reason: 'claim world does not match target world' })
    })
  })

  describe('when the claim scene differs from the target scene', () => {
    it('rejects (confines a worker to its own scene, not the whole world)', async () => {
      const result = await verify(buildScopeHeader({ sceneId: 'bafkrei-other-scene' }))
      expect(result).toEqual({ ok: false, reason: 'claim sceneId does not match target scene' })
    })
  })

  describe('when the claim parcel differs from the target parcel', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ parcel: '99,99' }))
      expect(result).toEqual({ ok: false, reason: 'claim parcel does not match target parcel' })
    })
  })

  describe('when the delegation has expired', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader({ expiration: Date.now() - 1_000 }))
      expect(result).toEqual({ ok: false, reason: 'delegation expired' })
    })
  })

  describe('when the claim is signed by an untrusted address', () => {
    it('rejects', async () => {
      const attacker = createUnsafeIdentity()
      const result = await verify(buildScopeHeader({ signer: attacker }))
      expect(result).toEqual({ ok: false, reason: 'claim not signed by a trusted authoritative address' })
    })
  })

  describe('when the signature is not a valid signature at all', () => {
    it('rejects instead of throwing', async () => {
      const header = Buffer.from(JSON.stringify({ payload: buildPayload(), signature: '0xnope' }), 'utf8').toString(
        'base64'
      )
      await expect(verify(header)).resolves.toEqual({
        ok: false,
        reason: 'claim not signed by a trusted authoritative address'
      })
    })
  })

  describe('when the header is missing', () => {
    it('rejects instead of throwing', async () => {
      await expect(verify(undefined)).resolves.toEqual({ ok: false, reason: 'missing scope header' })
    })
  })

  describe('when the header is repeated', () => {
    it('rejects instead of picking one', async () => {
      const header = buildScopeHeader()
      await expect(verify([header, header])).resolves.toEqual({ ok: false, reason: 'multiple scope headers' })
    })
  })

  describe('when the header is malformed', () => {
    it('rejects non-base64 / non-JSON input', async () => {
      const result = await verify('not-base64-json')
      expect(result).toEqual({ ok: false, reason: 'malformed scope header' })
    })

    it('rejects a JSON `null` payload without throwing', async () => {
      const header = Buffer.from('null', 'utf8').toString('base64')
      await expect(verify(header)).resolves.toEqual({ ok: false, reason: 'malformed scope header' })
    })

    it('rejects a JSON primitive payload', async () => {
      await expect(verify(Buffer.from('5', 'utf8').toString('base64'))).resolves.toEqual({
        ok: false,
        reason: 'malformed scope header'
      })
    })

    it('rejects a JSON array payload at the payload/signature check', async () => {
      await expect(verify(Buffer.from('[]', 'utf8').toString('base64'))).resolves.toEqual({
        ok: false,
        reason: 'scope missing payload or signature'
      })
    })

    it('rejects an oversized header before decoding', async () => {
      const result = await verify('A'.repeat(5000))
      expect(result).toEqual({ ok: false, reason: 'scope header too large' })
    })

    it('rejects a claim with a duplicate field line', async () => {
      const payload = buildPayload() + '\nSceneId: bafkrei-evil'
      await expect(verify(encodeScope(payload))).resolves.toEqual({ ok: false, reason: 'unparseable claim' })
    })

    it('rejects a claim with an unknown/extra line', async () => {
      const payload = buildPayload() + '\nExtra: injected'
      await expect(verify(encodeScope(payload))).resolves.toEqual({ ok: false, reason: 'unparseable claim' })
    })

    it('rejects a claim with the wrong domain-separation prefix', async () => {
      const payload = buildPayload().replace(DELEGATION_PREFIX, 'Decentraland Login')
      await expect(verify(encodeScope(payload))).resolves.toEqual({ ok: false, reason: 'unparseable claim' })
    })
  })

  describe('when no trusted signers are configured', () => {
    it('rejects', async () => {
      const result = await verify(buildScopeHeader(), { trustedSigners: [] })
      expect(result).toEqual({ ok: false, reason: 'no trusted authoritative signers configured' })
    })
  })
})
