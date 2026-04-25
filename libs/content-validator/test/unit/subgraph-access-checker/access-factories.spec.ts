import { EntityType } from '@dcl/schemas'
import { buildSubgraphAccessCheckerComponents } from './mock'
import { createSubgraphAccessCheckValidateFns } from '../../../src/validations/access/subgraph'
import { createOutfitsValidateFn } from '../../../src/validations/access/subgraph/outfits'
import { createProfileValidateFn } from '../../../src/validations/access/subgraph/profiles'
import type { SubgraphAccessCheckerComponents, ValidateFn } from '../../../src'

describe('when wiring subgraph access factories', () => {
  let components: SubgraphAccessCheckerComponents

  beforeEach(() => {
    components = buildSubgraphAccessCheckerComponents()
  })

  describe('and createSubgraphAccessCheckValidateFns is called', () => {
    let validateFns: Record<EntityType, ValidateFn>

    beforeEach(() => {
      validateFns = createSubgraphAccessCheckValidateFns(components)
    })

    it('should return a validate function for every supported entity type', () => {
      const expectedEntityTypes: EntityType[] = [
        EntityType.PROFILE,
        EntityType.SCENE,
        EntityType.WEARABLE,
        EntityType.STORE,
        EntityType.EMOTE,
        EntityType.OUTFITS
      ]
      expectedEntityTypes.forEach((type) => {
        expect(typeof validateFns[type]).toBe('function')
      })
    })
  })

  describe('and createProfileValidateFn is called directly', () => {
    it('should return a callable validate function', () => {
      expect(typeof createProfileValidateFn(components)).toBe('function')
    })
  })

  describe('and createOutfitsValidateFn is called directly', () => {
    it('should return a callable validate function', () => {
      expect(typeof createOutfitsValidateFn(components)).toBe('function')
    })
  })
})
