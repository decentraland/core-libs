import type { ContentMapping } from '@dcl/schemas'
import { EntityType, SceneParcels } from '@dcl/schemas'
import { validateAfterADR173, validateAfterADR236, validateAll, validateIfTypeMatches } from './validations'
import { OK, validationFailed } from '../types'
import type { DeploymentToValidate, ValidationResponse } from '../types'

/**
 * Validate that given scene deployment does not contain worldConfiguration section
 * @public
 */
export const noWorldsConfigurationValidateFn = validateAfterADR173(async function validateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const sceneHasWorldConfiguration = deployment.entity.metadata?.worldConfiguration !== undefined
  if (sceneHasWorldConfiguration) {
    return validationFailed(
      // Start of Selection
      'The scene.json contains a worldConfiguration section, which is not allowed for Genesis City scenes (see ADR-173: http://adr.decentraland.org/adr/ADR-173). Please remove it and try again.'
    )
  }
  return OK
})

/**
 * A scene `navmapThumbnail` must be a relative path to a file embedded in the deployment
 * (see ADR-236). Reject values that are not a plain relative path:
 * - carry a URI scheme (`https:`, `data:`, `javascript:`, …)
 * - are protocol-relative (`//host/…`) or root-absolute (`/x`)
 * - have leading/trailing whitespace or contain any control character
 * - contain the HTML-breakout characters `<`, `>` or `"`
 *
 * Beyond being unresolvable, a non-relative thumbnail is a stored-XSS vector: downstream
 * consumers such as the Places social/OpenGraph endpoint keep a `https://`-prefixed value
 * verbatim and interpolate it into HTML, so a filename like
 * `https://x"><script>…</script><meta name="y` becomes live markup. Constraining the field
 * to a relative path at the deployment gate stops the payload from ever being accepted.
 */
function isRelativeThumbnailPath(path: string): boolean {
  // A URI scheme, protocol-relative (`//…`) or root-absolute (`/…`) path is not relative.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path) || path.startsWith('/')) {
    return false
  }
  // Reject leading/trailing whitespace and any control character.
  if (path !== path.trim() || /\p{Cc}/u.test(path)) {
    return false
  }
  // Reject HTML-breakout characters so the value can never inject markup downstream.
  return !/[<>"]/.test(path)
}

/**
 * Validate that given scene deployment thumbnail is a relative path to a file embedded in the
 * deployment
 * @public
 */
export const embeddedThumbnail = validateAfterADR236(async function validateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const sceneThumbnail = deployment.entity.metadata?.display?.navmapThumbnail
  if (sceneThumbnail) {
    if (!isRelativeThumbnailPath(sceneThumbnail)) {
      return validationFailed(
        `Scene thumbnail '${sceneThumbnail}' must be a relative path to a file included in the deployment.`
      )
    }
    const isFilePresent = (deployment.entity.content ?? []).some(
      (content: ContentMapping) => content.file === sceneThumbnail
    )
    if (!isFilePresent) {
      return validationFailed(`Scene thumbnail '${sceneThumbnail}' must be a file included in the deployment.`)
    }
  }
  return OK
})

/**
 * Validate that every representation of a scene's parcel identity agrees before an access
 * validator authorizes the deployment. Schemas 27 validates the metadata's canonical, unique
 * parcels and base membership; this deployment-level check additionally compares those parcels
 * with the entity pointers, which the metadata schema cannot inspect.
 * @public
 */
export const sceneParcelsMatchPointersValidateFn = async function validateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const scene = deployment.entity.metadata?.scene
  if (!scene || !SceneParcels.validate(scene)) {
    return validationFailed('Scene parcels metadata must be valid, canonical, unique, and include the base parcel.')
  }

  const pointers = deployment.entity.pointers
  if (
    pointers.length === 0 ||
    !SceneParcels.validate({
      base: pointers[0],
      parcels: pointers
    })
  ) {
    return validationFailed('Scene pointers must be unique canonical parcel coordinates.')
  }

  const sceneParcels = scene.parcels
  const pointerSet = new Set(pointers)
  if (pointerSet.size !== sceneParcels.length || sceneParcels.some((parcel) => !pointerSet.has(parcel))) {
    return validationFailed('The scene parcels must match the entity pointers.')
  }

  return OK
}

/** @deprecated Use sceneParcelsMatchPointersValidateFn. */
export const sceneBaseIsIncludedInParcelsValidateFn = sceneParcelsMatchPointersValidateFn

/**
 * Validate that given scene deployment is valid
 * @public
 */
export const sceneValidateFn = validateIfTypeMatches(
  EntityType.SCENE,
  validateAll(sceneParcelsMatchPointersValidateFn, noWorldsConfigurationValidateFn, embeddedThumbnail)
)
