import { DELEGATION_PREFIX, buildClaimPayload, parseClaim } from '../../src'

const AUDIENCE = 'badges'
const EPHEMERAL = '0xAbCdEf0000000000000000000000000000000001'
const WORLD = 'Boedo.DCL.eth'
const SCENE = 'bafkrei-scene'
const PARCEL = '5,7'
const EXPIRATION = new Date('2030-01-01T00:00:00.000Z')
const INPUT = {
  audience: AUDIENCE,
  ephemeral: EPHEMERAL,
  world: WORLD,
  sceneId: SCENE,
  parcel: PARCEL,
  expiration: EXPIRATION
}

describe('buildClaimPayload', () => {
  it('writes the prefix and the six fields in canonical order', () => {
    const payload = buildClaimPayload(INPUT)
    expect(payload.split('\n')).toEqual([
      DELEGATION_PREFIX,
      `Audience: ${AUDIENCE}`,
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
    ['audience', { audience: '' }],
    ['audience', { audience: 'Badges' }],
    ['audience', { audience: 'badges.decentraland.org' }],
    ['ephemeral', { ephemeral: '0x1234' }],
    ['world', { world: 'boedo.dcl.eth\nParcel: 0,0' }],
    ['world', { world: '' }],
    // Kelvin sign: lowercases to `k`, so it must be rejected before lowercasing.
    ['world', { world: 'Ka.dcl.eth' }],
    ['sceneId', { sceneId: 'bafkrei scene' }],
    ['sceneId', { sceneId: 'bafkrei-scene\r' }],
    ['parcel', { parcel: '5, 7' }]
  ])('throws on a malformed %s', (field, override) => {
    expect(() => buildClaimPayload({ ...INPUT, ...override })).toThrow(`Invalid delegation claim ${field}`)
  })
})

type Field = 'Audience' | 'Ephemeral' | 'World' | 'SceneId' | 'Parcel' | 'Expiration'

function claimWith(overrides: Partial<Record<Field, string>>, omit: Field[] = []) {
  const lines: Partial<Record<Field, string>> = {
    Audience: `Audience: ${AUDIENCE}`,
    Ephemeral: `Ephemeral: ${EPHEMERAL.toLowerCase()}`,
    World: 'World: boedo.dcl.eth',
    SceneId: `SceneId: ${SCENE}`,
    Parcel: `Parcel: ${PARCEL}`,
    Expiration: `Expiration: ${EXPIRATION.toISOString()}`,
    ...overrides
  }
  for (const field of omit) delete lines[field]
  return [DELEGATION_PREFIX, ...Object.values(lines)].join('\n')
}

describe('parseClaim', () => {
  it('round-trips what buildClaimPayload produced', () => {
    const payload = buildClaimPayload(INPUT)
    expect(parseClaim(payload)).toEqual({
      audience: AUDIENCE,
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
      'World: boedo.dcl.eth',
      `Audience: ${AUDIENCE}`,
      `Ephemeral: ${EPHEMERAL.toLowerCase()}`
    ].join('\n')
    expect(parseClaim(payload)?.world).toBe('boedo.dcl.eth')
  })

  it('rejects a wrong prefix line', () => {
    // Every field is still present, so only the prefix check rejects this.
    expect(parseClaim(claimWith({}).replace(DELEGATION_PREFIX, 'Decentraland Login'))).toBeNull()
  })

  it('rejects the v1 storage claim', () => {
    const payload = claimWith({}, ['Audience']).replace(
      DELEGATION_PREFIX,
      'Decentraland Authoritative Storage Delegation'
    )
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects a duplicate field line', () => {
    const payload = claimWith({}) + '\nSceneId: bafkrei-evil'
    expect(parseClaim(payload)).toBeNull()
  })

  it('rejects an unknown line', () => {
    const payload = buildClaimPayload(INPUT) + '\nExtra: injected'
    expect(parseClaim(payload)).toBeNull()
  })

  it.each<Field>(['Audience', 'Ephemeral', 'World', 'SceneId', 'Parcel', 'Expiration'])(
    'rejects a missing %s field',
    (field) => {
      expect(parseClaim(claimWith({}, [field]))).toBeNull()
    }
  )

  it('rejects an empty value', () => {
    expect(parseClaim(claimWith({ SceneId: 'SceneId: ' }))).toBeNull()
  })

  it('rejects an unparseable expiration', () => {
    expect(parseClaim(claimWith({ Expiration: 'Expiration: soon' }))).toBeNull()
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

  it.each<[Field, string]>([
    ['Audience', 'Audience: Badges'],
    ['Audience', 'Audience: badges.decentraland.org'],
    ['Ephemeral', 'Ephemeral: zzz'],
    ['Ephemeral', `Ephemeral: ${EPHEMERAL}`],
    ['World', 'World: BOEDO.DCL.ETH'],
    ['SceneId', 'SceneId: ../x'],
    ['Parcel', 'Parcel: abc']
  ])('rejects a %s value outside its format (%p), without case folding', (field, line) => {
    expect(parseClaim(claimWith({ [field]: line } as Partial<Record<Field, string>>))).toBeNull()
  })

  it.each(['2030', 'Jan 1 2030 00:00', '2030-01-01', '2030-01-01T00:00:00Z', '2030-01-01T00:00:00.000+00:00'])(
    'rejects the non-canonical expiration %p',
    (expiration) => {
      expect(parseClaim(claimWith({ Expiration: `Expiration: ${expiration}` }))).toBeNull()
    }
  )
})
