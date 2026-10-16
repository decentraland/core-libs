import { DELEGATION_PREFIX, buildClaimPayload, parseClaim } from '../../src'

const EPHEMERAL = '0xAbCdEf0000000000000000000000000000000001'
const WORLD = 'Boedo.DCL.eth'
const SCENE = 'bafkrei-scene'
const PARCEL = '5,7'
const EXPIRATION = new Date('2030-01-01T00:00:00.000Z')
const INPUT = { ephemeral: EPHEMERAL, world: WORLD, sceneId: SCENE, parcel: PARCEL, expiration: EXPIRATION }

describe('buildClaimPayload', () => {
  it('writes the prefix and the five fields in canonical order', () => {
    const payload = buildClaimPayload(INPUT)
    expect(payload.split('\n')).toEqual([
      DELEGATION_PREFIX,
      `Ephemeral: ${EPHEMERAL.toLowerCase()}`,
      'World: boedo.dcl.eth',
      `SceneId: ${SCENE}`,
      `Parcel: ${PARCEL}`,
      'Expiration: 2030-01-01T00:00:00.000Z'
    ])
  })

  it('accepts a numeric expiration (unix millis)', () => {
    const payload = buildClaimPayload({ ...INPUT, expiration: EXPIRATION.getTime() })
    expect(payload).toContain('Expiration: 2030-01-01T00:00:00.000Z')
  })

  it('throws on an invalid expiration instead of a bare RangeError', () => {
    expect(() => buildClaimPayload({ ...INPUT, expiration: new Date('nope') })).toThrow(
      'Invalid delegation claim expiration'
    )
    expect(() => buildClaimPayload({ ...INPUT, expiration: NaN })).toThrow('Invalid delegation claim expiration')
  })

  it.each([
    ['ephemeral', { ephemeral: '0x1234' }],
    ['world', { world: 'boedo.dcl.eth\nParcel: 0,0' }],
    ['world', { world: '' }],
    ['sceneId', { sceneId: 'bafkrei scene' }],
    ['sceneId', { sceneId: 'bafkrei-scene\r' }],
    ['parcel', { parcel: '5, 7' }]
  ])('throws on a malformed %s', (field, override) => {
    expect(() => buildClaimPayload({ ...INPUT, ...override })).toThrow(`Invalid delegation claim ${field}`)
  })
})

function claimWith(overrides: Partial<Record<'Ephemeral' | 'World' | 'SceneId' | 'Parcel' | 'Expiration', string>>) {
  const lines = {
    Ephemeral: `Ephemeral: ${EPHEMERAL.toLowerCase()}`,
    World: 'World: boedo.dcl.eth',
    SceneId: `SceneId: ${SCENE}`,
    Parcel: `Parcel: ${PARCEL}`,
    Expiration: `Expiration: ${EXPIRATION.toISOString()}`,
    ...overrides
  }
  return [DELEGATION_PREFIX, ...Object.values(lines)].join('\n')
}

describe('parseClaim', () => {
  it('round-trips what buildClaimPayload produced', () => {
    const payload = buildClaimPayload(INPUT)
    expect(parseClaim(payload)).toEqual({
      ephemeral: EPHEMERAL.toLowerCase(),
      world: 'boedo.dcl.eth',
      sceneId: SCENE,
      parcel: PARCEL,
      expiration: EXPIRATION.getTime()
    })
  })

  it('is order-agnostic after the prefix line', () => {
    const payload = [
      DELEGATION_PREFIX,
      `Parcel: ${PARCEL}`,
      `Expiration: ${EXPIRATION.toISOString()}`,
      `SceneId: ${SCENE}`,
      `World: ${WORLD}`,
      `Ephemeral: ${EPHEMERAL}`
    ].join('\n')
    expect(parseClaim(payload)?.world).toBe('boedo.dcl.eth')
  })

  it('rejects a missing prefix', () => {
    const payload = [
      `Ephemeral: ${EPHEMERAL}`,
      `World: ${WORLD}`,
      `SceneId: ${SCENE}`,
      `Parcel: ${PARCEL}`,
      `Expiration: ${EXPIRATION.toISOString()}`
    ].join('\n')
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects a duplicate field line', () => {
    const payload = [
      DELEGATION_PREFIX,
      `Ephemeral: ${EPHEMERAL}`,
      `World: ${WORLD}`,
      `SceneId: ${SCENE}`,
      'SceneId: bafkrei-evil',
      `Parcel: ${PARCEL}`,
      `Expiration: ${EXPIRATION.toISOString()}`
    ].join('\n')
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects an unknown line', () => {
    const payload = buildClaimPayload(INPUT) + '\nAudience: badges'
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects a missing field', () => {
    const payload = [
      DELEGATION_PREFIX,
      `Ephemeral: ${EPHEMERAL}`,
      `World: ${WORLD}`,
      `SceneId: ${SCENE}`,
      `Parcel: ${PARCEL}`
    ].join('\n')
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects an unparseable expiration', () => {
    const payload = [
      DELEGATION_PREFIX,
      `Ephemeral: ${EPHEMERAL}`,
      `World: ${WORLD}`,
      `SceneId: ${SCENE}`,
      `Parcel: ${PARCEL}`,
      'Expiration: soon'
    ].join('\n')
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects a CR inside a value instead of trimming it', () => {
    expect(parseClaim(claimWith({ World: 'World: boedo.dcl.eth\r' }))).toBeNull()
  })

  it('rejects surrounding whitespace instead of trimming it', () => {
    expect(parseClaim(claimWith({ World: 'World:  boedo.dcl.eth' }))).toBeNull()
    expect(parseClaim(claimWith({ World: 'World: boedo.dcl.eth ' }))).toBeNull()
  })

  it('rejects a field without the separator space', () => {
    expect(parseClaim(claimWith({ World: 'World:boedo.dcl.eth' }))).toBeNull()
  })

  it.each(['2030', 'Jan 1 2030 00:00', '2030-01-01', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00.000+00:00'])(
    'rejects the non-canonical expiration %p',
    (expiration) => {
      expect(parseClaim(claimWith({ Expiration: `Expiration: ${expiration}` }))).toBeNull()
    }
  )
})
