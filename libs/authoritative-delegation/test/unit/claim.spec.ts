import { buildClaimPayload, DELEGATION_PREFIX, parseClaim } from '../src'

const EPHEMERAL = '0xAbCdEf0000000000000000000000000000000001'
const WORLD = 'Boedo.DCL.eth'
const SCENE = 'bafkrei-scene'
const PARCEL = '5,7'
const EXPIRATION = new Date('2030-01-01T00:00:00.000Z')

describe('buildClaimPayload', () => {
  it('writes the prefix and the five fields in canonical order', () => {
    const payload = buildClaimPayload({ ephemeral: EPHEMERAL, world: WORLD, sceneId: SCENE, parcel: PARCEL, expiration: EXPIRATION })
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
    const payload = buildClaimPayload({ ephemeral: EPHEMERAL, world: WORLD, sceneId: SCENE, parcel: PARCEL, expiration: EXPIRATION.getTime() })
    expect(payload).toContain('Expiration: 2030-01-01T00:00:00.000Z')
  })
})

describe('parseClaim', () => {
  it('round-trips what buildClaimPayload produced', () => {
    const payload = buildClaimPayload({ ephemeral: EPHEMERAL, world: WORLD, sceneId: SCENE, parcel: PARCEL, expiration: EXPIRATION })
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
    const payload = [`Ephemeral: ${EPHEMERAL}`, `World: ${WORLD}`, `SceneId: ${SCENE}`, `Parcel: ${PARCEL}`, `Expiration: ${EXPIRATION.toISOString()}`].join('\n')
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
    const payload = buildClaimPayload({ ephemeral: EPHEMERAL, world: WORLD, sceneId: SCENE, parcel: PARCEL, expiration: EXPIRATION }) + '\nAudience: badges'
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects a missing field', () => {
    const payload = [DELEGATION_PREFIX, `Ephemeral: ${EPHEMERAL}`, `World: ${WORLD}`, `SceneId: ${SCENE}`, `Parcel: ${PARCEL}`].join('\n')
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects an unparseable expiration', () => {
    const payload = [DELEGATION_PREFIX, `Ephemeral: ${EPHEMERAL}`, `World: ${WORLD}`, `SceneId: ${SCENE}`, `Parcel: ${PARCEL}`, 'Expiration: soon'].join('\n')
    expect(parseClaim(payload)).toBeNull()
  })
})
