import { canonicalField, rejectIfSigner, requireCanonicalField, requireSigner } from '../../src/metadataValidators'

const SCENE = 'decentraland-kernel-scene'

describe('canonicalField', () => {
  let predicate: ReturnType<typeof canonicalField>

  beforeEach(() => {
    predicate = canonicalField('intent')
  })

  describe('when the field is absent', () => {
    it('should pass, leaving presence to the predicate it is combined with', () => {
      expect(predicate({})).toBe(true)
    })
  })

  describe('when the field is already trimmed and lowercase', () => {
    it('should pass', () => {
      expect(predicate({ intent: 'dcl:explorer:comms-handshake' })).toBe(true)
    })
  })

  describe.each([
    ['an uppercase letter', 'DCL:Explorer:Comms-Handshake'],
    ['a single flipped character', 'dcl:explorer:comms-Handshake'],
    ['a leading space', ' dcl:explorer:comms-handshake'],
    ['a trailing tab', 'dcl:explorer:comms-handshake\t']
  ])('when the field contains %s', (_case, value) => {
    it('should fail rather than fold the value', () => {
      expect(predicate({ intent: value })).toBe(false)
    })
  })

  describe.each([
    ['a number', 42],
    ['null', null],
    ['an object', { a: 1 }]
  ])('when the field is present as %s', (_case, value) => {
    it('should fail because it is not the expected form', () => {
      expect(predicate({ intent: value })).toBe(false)
    })
  })
})

describe('rejectIfSigner', () => {
  let predicate: ReturnType<typeof rejectIfSigner>

  beforeEach(() => {
    predicate = rejectIfSigner(SCENE)
  })

  describe('when the signer is absent', () => {
    it('should pass, since the request claims to be none of the refused signers', () => {
      expect(predicate({})).toBe(true)
    })
  })

  describe('when the signer is a different canonical value', () => {
    it('should pass', () => {
      expect(predicate({ signer: 'dcl:explorer' })).toBe(true)
    })
  })

  describe('when the signer is exactly a refused value', () => {
    it('should fail', () => {
      expect(predicate({ signer: SCENE })).toBe(false)
    })
  })

  describe.each([
    ['mixed case', 'Decentraland-Kernel-Scene'],
    ['upper case', 'DECENTRALAND-KERNEL-SCENE'],
    ['a leading space', ' decentraland-kernel-scene']
  ])('when a refused signer is re-spelled in %s', (_case, signer) => {
    it('should fail rather than read as a different signer', () => {
      // The whole point: under an exact comparison alone this spelling reads as "not the scene"
      // and passes the gate. Rejecting it keeps the comparison meaningful.
      expect(predicate({ signer })).toBe(false)
    })
  })

  describe('when constructed with no signers', () => {
    it('should throw at wiring time', () => {
      expect(() => rejectIfSigner()).toThrow('requires at least one value')
    })
  })

  describe('when constructed with a non-canonical signer', () => {
    it('should throw rather than build a predicate that can never fire', () => {
      expect(() => rejectIfSigner('Decentraland-Kernel-Scene')).toThrow('expects canonical')
    })
  })
})

describe('requireSigner', () => {
  let predicate: ReturnType<typeof requireSigner>

  beforeEach(() => {
    predicate = requireSigner(SCENE, 'dcl:authoritative-server')
  })

  describe('when the signer is the first accepted value', () => {
    it('should pass', () => {
      expect(predicate({ signer: SCENE })).toBe(true)
    })
  })

  describe('when the signer is a later accepted value', () => {
    it('should pass', () => {
      expect(predicate({ signer: 'dcl:authoritative-server' })).toBe(true)
    })
  })

  describe('when the signer is absent', () => {
    it('should fail closed', () => {
      expect(predicate({})).toBe(false)
    })
  })

  describe('when the signer is outside the accepted list', () => {
    it('should fail', () => {
      expect(predicate({ signer: 'dcl:explorer' })).toBe(false)
    })
  })

  describe('when an accepted signer is re-spelled in mixed case', () => {
    it('should fail rather than be accepted as that signer', () => {
      expect(predicate({ signer: 'Decentraland-Kernel-Scene' })).toBe(false)
    })
  })

  describe('when constructed with a non-canonical signer', () => {
    it('should throw at wiring time', () => {
      expect(() => requireSigner(' dcl:explorer')).toThrow('expects canonical')
    })
  })
})

// A plain property read walks the prototype chain, so a polluted `Object.prototype` would supply a
// `signer` no client sent. `JSON.parse` cannot pollute the prototype itself, but consumer code that
// spreads or `Object.assign`s metadata into another object can, so these gates must not rely on it.
describe('prototype-inherited fields', () => {
  describe('when a field exists only on the metadata prototype', () => {
    let inherited: Record<string, unknown>

    beforeEach(() => {
      inherited = Object.create({ signer: SCENE, intent: 'dcl:explorer:comms-handshake' }) as Record<string, unknown>
    })

    it('should be treated as absent by canonicalField', () => {
      expect(canonicalField('intent')(inherited)).toBe(true)
    })

    it('should not satisfy requireSigner', () => {
      expect(requireSigner(SCENE)(inherited)).toBe(false)
    })

    it('should not trip rejectIfSigner, since the request declared no signer', () => {
      expect(rejectIfSigner(SCENE)(inherited)).toBe(true)
    })
  })

  describe('and the pollution is on Object.prototype itself', () => {
    beforeEach(() => {
      ;(Object.prototype as Record<string, unknown>).signer = SCENE
    })

    afterEach(() => {
      delete (Object.prototype as Record<string, unknown>).signer
    })

    it('should not let metadata without an own signer satisfy requireSigner', () => {
      // Before the own-property lookup this returned true: a request carrying no signer at all was
      // accepted as the scene signer.
      expect(requireSigner(SCENE)({})).toBe(false)
    })

    it('should still reject an own signer that matches', () => {
      expect(requireSigner(SCENE)({ signer: SCENE })).toBe(true)
    })
  })
})

describe('requireCanonicalField', () => {
  let predicate: ReturnType<typeof requireCanonicalField>

  beforeEach(() => {
    predicate = requireCanonicalField('intent', 'dcl:explorer:comms-handshake')
  })

  describe('when the field is an own canonical listed value', () => {
    it('should pass', () => {
      expect(predicate({ intent: 'dcl:explorer:comms-handshake' })).toBe(true)
    })
  })

  describe.each([
    ['absent', {}],
    ['a different value', { intent: 'dcl:builder' }],
    ['re-spelled in mixed case', { intent: 'DCL:Explorer:Comms-Handshake' }],
    ['padded', { intent: ' dcl:explorer:comms-handshake' }],
    ['not a string', { intent: 42 }]
  ])('when the field is %s', (_case, metadata) => {
    it('should fail closed', () => {
      expect(predicate(metadata as Record<string, unknown>)).toBe(false)
    })
  })

  describe('when the field exists only on the prototype', () => {
    let inherited: Record<string, unknown>

    beforeEach(() => {
      inherited = Object.create({ intent: 'dcl:explorer:comms-handshake' }) as Record<string, unknown>
    })

    it('should fail closed rather than compare an inherited value', () => {
      // The hazard this helper exists to remove: composing canonicalField with a hand-written
      // `m.intent === ...` passes here, because the form check sees the field as absent while the
      // equality check reads straight through the prototype.
      expect(predicate(inherited)).toBe(false)
    })

    it('should demonstrate the hand-written composition it replaces is unsafe', () => {
      const handRolled = (m: Record<string, unknown>) =>
        canonicalField('intent')(m) && m.intent === 'dcl:explorer:comms-handshake'

      expect(handRolled(inherited)).toBe(true)
    })
  })

  describe.each([
    ['a non-string', 42],
    ['an empty string', '']
  ])('when constructed with %s', (_case, value) => {
    it('should throw a configuration error rather than fail later', () => {
      expect(() => requireCanonicalField('intent', value as string)).toThrow('expects non-empty string values')
    })
  })
})

describe.each([
  ['rejectIfSigner', rejectIfSigner],
  ['requireSigner', requireSigner]
])('%s argument handling', (name, factory) => {
  describe.each([
    ['a non-string', 42],
    ['an empty string', '']
  ])('when constructed with %s', (_case, value) => {
    it('should throw a configuration error naming the helper', () => {
      expect(() => factory(value as string)).toThrow(new RegExp(`^${name}\\(\\) expects non-empty string values`))
    })
  })
})
