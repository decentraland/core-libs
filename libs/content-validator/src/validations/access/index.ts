import { EntityType } from '@dcl/schemas'
import { OK, validationFailed } from '../../types'
import { LEGACY_CONTENT_MIGRATION_TIMESTAMP } from '../timestamps'
import type { ContentValidatorComponents, DeploymentToValidate, ValidateFn, ValidationResponse } from '../../types'

/**
 * Validate that the pointers are valid, and that the Ethereum address has write access to them
 * @public
 */
export function createAccessValidateFn(
  components: Pick<ContentValidatorComponents, 'externalCalls'>,
  accessValidateFns: Record<EntityType, ValidateFn>
): ValidateFn {
  const { externalCalls } = components

  return async function validateFn(deployment: DeploymentToValidate): Promise<ValidationResponse> {
    const deployedBeforeDCLLaunch = deployment.entity.timestamp <= LEGACY_CONTENT_MIGRATION_TIMESTAMP
    const address = externalCalls.ownerAddress(deployment.auditInfo)

    const isDefaultScene =
      deployment.entity.type === EntityType.SCENE &&
      deployment.entity.pointers.some((p) => p.toLowerCase().startsWith('default'))

    if (isDefaultScene) {
      return validationFailed(
        `Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45).`
      )
    }
    if (deployedBeforeDCLLaunch && externalCalls.isAddressOwnedByDecentraland(address)) {
      return OK
    }

    return accessValidateFns[deployment.entity.type](deployment)
  }
}
