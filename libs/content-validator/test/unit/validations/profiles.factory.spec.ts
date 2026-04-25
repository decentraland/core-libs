import { EntityType } from '@dcl/schemas'
import { createProfileValidateFn } from '../../../src/validations/profile'
import { ADR_45_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import { buildComponents } from '../../setup/mock'
import type { DeploymentToValidate, ValidationResponse } from '../../../src/types'

describe('when creating profile validate function', () => {
  let validateFn: ReturnType<typeof createProfileValidateFn>
  let deployment: DeploymentToValidate

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('and the entity is not a profile', () => {
    beforeEach(() => {
      deployment = buildDeployment({
        entity: buildEntity({
          type: EntityType.SCENE,
          timestamp: ADR_45_TIMESTAMP + 1000
        })
      })
      const components = buildComponents()
      validateFn = createProfileValidateFn(components)
    })

    it('should return ok', async () => {
      const result: ValidationResponse = await validateFn(deployment)
      expect(result.ok).toBe(true)
    })
  })
})
