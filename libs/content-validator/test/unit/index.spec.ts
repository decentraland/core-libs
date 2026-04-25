import { EntityType } from '@dcl/schemas'
import { createValidator } from '../../src'
import { OK, validationFailed } from '../../src/types'
import { ADR_45_TIMESTAMP } from '../../src/validations/timestamps'
import { buildDeployment } from '../setup/deployments'
import { buildEntity } from '../setup/entity'
import { buildComponents } from '../setup/mock'
import type { ValidateFn, ValidationResponse } from '../../src/types'

const buildPreAdr45SceneDeployment = () =>
  buildDeployment({
    entity: buildEntity({
      type: EntityType.SCENE,
      metadata: { main: 'bin/main.js', scene: { base: '0,0', parcels: ['0,0'] } },
      pointers: ['0,0'],
      timestamp: ADR_45_TIMESTAMP - 1000
    })
  })

describe('when calling createValidator', () => {
  describe('and every validation in the chain succeeds', () => {
    let result: ValidationResponse
    let accessValidateFn: jest.MockedFunction<ValidateFn>

    beforeEach(async () => {
      accessValidateFn = jest.fn().mockResolvedValue(OK) as jest.MockedFunction<ValidateFn>
      const validateFn = createValidator(buildComponents({ accessValidateFn }))
      result = await validateFn(buildPreAdr45SceneDeployment())
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return ok and call the access validation', () => {
      expect(result).toEqual(OK)
      expect(accessValidateFn).toHaveBeenCalled()
    })
  })

  describe('and a validation in the chain fails before the access validation', () => {
    let result: ValidationResponse
    let accessValidateFn: jest.MockedFunction<ValidateFn>

    beforeEach(async () => {
      accessValidateFn = jest.fn().mockResolvedValue(OK) as jest.MockedFunction<ValidateFn>
      const validateFn = createValidator(buildComponents({ accessValidateFn }))
      const deployment = buildDeployment({
        entity: buildEntity({
          id: 'QmTBPcZLFQf1rZpZg2T8nMDwWRoqeftRdvkaexgAECaqHp',
          timestamp: ADR_45_TIMESTAMP + 1000
        })
      })
      result = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should short-circuit the chain and not call the access validation', () => {
      expect(result.ok).toBe(false)
      expect(accessValidateFn).not.toHaveBeenCalled()
    })
  })

  describe('and the access validation fails', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const accessValidateFn = jest
        .fn()
        .mockResolvedValue(validationFailed('access denied')) as jest.MockedFunction<ValidateFn>
      const validateFn = createValidator(buildComponents({ accessValidateFn }))
      result = await validateFn(buildPreAdr45SceneDeployment())
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return the access validation error', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain('access denied')
    })
  })
})
