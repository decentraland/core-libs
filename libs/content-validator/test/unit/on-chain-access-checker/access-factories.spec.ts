import { EntityType } from '@dcl/schemas'
import { buildOnChainAccessCheckerComponents } from './mock'
import { createOnChainAccessCheckValidateFns } from '../../../src/validations/access/on-chain'
import { createOutfitsValidateFn } from '../../../src/validations/access/on-chain/outfits'
import { createProfileValidateFn } from '../../../src/validations/access/on-chain/profiles'
import type { OnChainAccessCheckerComponents, ValidateFn } from '../../../src'

describe('when wiring on-chain access factories', () => {
  let components: OnChainAccessCheckerComponents

  beforeEach(() => {
    components = buildOnChainAccessCheckerComponents()
  })

  describe('and createOnChainAccessCheckValidateFns is called', () => {
    let validateFns: Record<EntityType, ValidateFn>

    beforeEach(() => {
      validateFns = createOnChainAccessCheckValidateFns(components)
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
