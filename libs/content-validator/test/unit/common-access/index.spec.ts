import { EntityType } from '@dcl/schemas'
import { createPointerValidateFn } from '../../../src/validations/access/common/profile'
import { createAccessValidateFn } from '../../../src/validations/access/index'
import { LEGACY_CONTENT_MIGRATION_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildProfileEntity } from '../../setup/entity'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

describe('when running the access validate function', () => {
  const deployerAddress = '0x0000000000000000000000000000000000000001'
  const pointerAddress = '0x0000000000000000000000000000000000000002'
  let validateFn: ReturnType<typeof createAccessValidateFn>

  beforeEach(() => {
    const externalCalls = buildExternalCalls({
      ownerAddress: () => deployerAddress,
      isAddressOwnedByDecentraland: (address) => address === deployerAddress
    })
    const accessValidateFns = {
      [EntityType.PROFILE]: createPointerValidateFn({ externalCalls }),
      [EntityType.SCENE]: jest.fn(),
      [EntityType.WEARABLE]: jest.fn(),
      [EntityType.STORE]: jest.fn(),
      [EntityType.EMOTE]: jest.fn(),
      [EntityType.OUTFITS]: jest.fn()
    }
    validateFn = createAccessValidateFn({ externalCalls }, accessValidateFns)
  })

  describe('and the deployer is not the pointer owner after the legacy content migration timestamp', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildProfileEntity({
        pointers: [pointerAddress],
        timestamp: LEGACY_CONTENT_MIGRATION_TIMESTAMP + 1
      })
      const deployment = buildDeployment({ entity })
      result = await validateFn(deployment)
    })

    it('should return an error stating that the pointer and signer addresses are different', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toEqual([
        'You can only alter your own profile. The pointer address and the signer address are different (pointer:0x0000000000000000000000000000000000000002 signer: 0x0000000000000000000000000000000000000001).'
      ])
    })
  })

  describe('and the deployer is not the pointer owner before the legacy content migration timestamp', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildProfileEntity({
        pointers: [pointerAddress],
        timestamp: LEGACY_CONTENT_MIGRATION_TIMESTAMP - 1
      })
      const deployment = buildDeployment({ entity })
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})
