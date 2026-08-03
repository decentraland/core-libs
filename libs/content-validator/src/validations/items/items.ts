import { EntityType, WearableCategory } from '@dcl/schemas'
import type { Wearable } from '@dcl/schemas'
import { calculateDeploymentSize } from '..'
import { readImageMetadata } from '../../image-metadata'
import { OK, validationFailed } from '../../types'
import { entityParameters, skinMaxSizeInMb, thumbnailMaxSizeInMb } from '../ADR51'
import { validateAfterADR45, validateAll, validateIfConditionMet } from '../validations'
import type { ContentValidatorComponents, DeploymentToValidate, ValidateFn, ValidationResponse } from '../../types'
import type { BaseItem } from '@dcl/schemas/dist/platform/item/base-item'

/** Validate item files size, excluding thumbnail, is less than expected */
export function createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(
  components: Pick<ContentValidatorComponents, 'externalCalls'>
): ValidateFn {
  async function validateFn(deployment: DeploymentToValidate): Promise<ValidationResponse> {
    const entity = deployment.entity
    let maxSizeInMB = entityParameters[entity.type]?.maxSizeInMB
    if (!maxSizeInMB) {
      return validationFailed(`Type ${entity.type} is not supported yet`)
    }

    if (entity.type === EntityType.WEARABLE) {
      const wearable = entity.metadata as Wearable
      if (wearable.data?.category === WearableCategory.SKIN) {
        maxSizeInMB = skinMaxSizeInMb
      }
    }

    const modelSizeInMB = maxSizeInMB - thumbnailMaxSizeInMb

    const metadata = entity.metadata as BaseItem
    const thumbnailHash = entity.content?.find(({ file }) => file === metadata.thumbnail)?.hash
    if (!thumbnailHash) {
      return validationFailed("Couldn't find the thumbnail hash")
    }

    const totalDeploymentSizeInB = await calculateDeploymentSize(deployment, components.externalCalls)
    if (typeof totalDeploymentSizeInB === 'string') return validationFailed(totalDeploymentSizeInB)
    const thumbnailSize = deployment.files.get(thumbnailHash)?.byteLength ?? 0

    if (thumbnailSize > thumbnailMaxSizeInMb * 1024 * 1024) {
      return validationFailed(
        `The thumbnail is too big. The maximum allowed size for thumbnail model files is ${thumbnailMaxSizeInMb} MB. You can upload up to ${
          thumbnailMaxSizeInMb * 1024 * 1024
        } bytes but you tried to upload ${thumbnailSize}.`
      )
    }

    const modelSize = totalDeploymentSizeInB - thumbnailSize
    if (modelSize > modelSizeInMB * 1024 * 1024)
      return validationFailed(
        `The deployment is too big. The maximum allowed size for ${
          entity.type
        } model files is ${modelSizeInMB} MB. You can upload up to ${
          modelSizeInMB * 1024 * 1024
        } bytes but you tried to upload ${modelSize}.`
      )
    return OK
  }

  return validateAfterADR45(validateFn)
}

/** Validate that given item deployment includes a thumbnail with valid format and size */
const maxThumbnailDimensionInPx = 1024

export function createThumbnailMaxSizeIsNotExceededValidateFn(
  components: Pick<ContentValidatorComponents, 'externalCalls' | 'logs'>
): ValidateFn {
  const { externalCalls, logs } = components
  const logger = logs.getLogger('thumbnail size validator')
  async function validateFn(deployment: DeploymentToValidate) {
    const metadata = deployment.entity.metadata as Wearable

    const hash = deployment.entity.content?.find(({ file }) => file === metadata.thumbnail)?.hash
    if (!hash) {
      return validationFailed(`Couldn't find hash for thumbnail file with name: ${metadata.thumbnail}`)
    }

    const errors: string[] = []
    const thumbnailBuffer = deployment.files.get(hash)
    if (!thumbnailBuffer) {
      const isHashStored = (await externalCalls.isContentStoredAlready([hash])).get(hash) ?? false
      if (!isHashStored) {
        return validationFailed(`Couldn't find thumbnail file with hash: ${hash}`)
      }
      logger.debug(`Thumbnail file with hash: ${hash} is not in the deployment, but it is already stored`, {
        type: deployment.entity.type
      })
      return OK
    }
    try {
      const { width, height, format } = readImageMetadata(thumbnailBuffer)
      if (format !== 'png') {
        errors.push(`Invalid or unknown image format. Only 'PNG' format is accepted.`)
      } else if (width > maxThumbnailDimensionInPx || height > maxThumbnailDimensionInPx) {
        errors.push(`Invalid thumbnail image size (width = ${width} / height = ${height})`)
      }
    } catch (err) {
      logger.debug('readImageMetadata failed', { error: String(err) })
      errors.push(`Couldn't parse thumbnail, please check image format.`)
    }
    return errors.length > 0 ? validationFailed(...errors) : OK
  }

  return validateAfterADR45(validateFn)
}

/**
 * Validate that given item deployment includes the thumbnail and doesn't exceed file sizes
 * * @public
 */
export function createItemsValidateFn(components: ContentValidatorComponents): ValidateFn {
  return validateIfConditionMet(
    (deployment) => deployment.entity.type === EntityType.WEARABLE || deployment.entity.type === EntityType.EMOTE,
    validateAll(
      createThumbnailMaxSizeIsNotExceededValidateFn(components),
      createDeploymentMaxSizeExcludingThumbnailIsNotExceededValidateFn(components)
    )
  )
}
