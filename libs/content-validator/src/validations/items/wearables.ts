import { keccak256Hash } from '@dcl/hashing'
import type { ThirdPartyProps, Wearable } from '@dcl/schemas'
import { EntityType, SpringBonesData, isThirdParty } from '@dcl/schemas'
import { OK, validationFailed } from '../../types'
import { validateAll, validateIfTypeMatches } from '../validations'
import type { DeploymentToValidate } from '../..'
import type { ValidationResponse } from '../../types'

/** Validate wearable representations are referencing valid content */
export async function wearableRepresentationContentValidateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const { entity } = deployment
  const wearableMetadata = entity.metadata as Wearable
  const representations = wearableMetadata?.data?.representations
  if (!representations || representations.length === 0) return validationFailed('No wearable representations found')
  if (!entity.content || entity.content.length === 0) return validationFailed('No content found')

  for (const representation of representations) {
    for (const representationContent of representation.contents) {
      if (!entity.content.find((content) => content.file === representationContent)) {
        return validationFailed(`Representation content: '${representationContent}' is not one of the content files`)
      }
    }
  }
  return OK
}

const REQUIRED_THIRD_PARTY_WEARABLE_HASHING_KEYS = ['id', 'content', 'data'] as const

export async function thirdPartyWearableMerkleProofContentValidateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const { entity } = deployment
  if (!isThirdParty(entity.metadata)) {
    return OK
  }

  const wearableMetadata = entity.metadata as Wearable & ThirdPartyProps

  // Check the id in the metadata matches the pointer being deployed
  if (wearableMetadata.id.toLowerCase() !== entity.pointers[0].toLowerCase()) {
    return validationFailed(`The id '${wearableMetadata.id}' does not match the pointer '${entity.pointers[0]}'`)
  }

  // Fields not in the hashing keys aren't committed by the leaf, so the checks below could be met with
  // attacker-chosen values unless they are required here
  const missingKey = REQUIRED_THIRD_PARTY_WEARABLE_HASHING_KEYS.find(
    (key) => !wearableMetadata.merkleProof.hashingKeys.includes(key)
  )
  if (missingKey) {
    return validationFailed(`The third-party wearable merkle proof must commit the '${missingKey}' field`)
  }

  // Check the content files declared inside the metadata is exactly the same as the files uploaded with the entity
  const allContentInFiles = Object.keys(wearableMetadata.content).every((content) => {
    const contentFile = entity.content.find((file) => file.file === content)
    if (!contentFile) {
      return false
    }
    return contentFile.hash === wearableMetadata.content[content]
  })

  const allFilesInContent = entity.content.every((content) => {
    return wearableMetadata.content[content.file] === content.hash
  })
  if (!allContentInFiles || !allFilesInContent) {
    return validationFailed('The content declared in the metadata does not match the files uploaded with the entity')
  }

  // Re-create the entity hash and check it matches the one provided in the metadata
  const merkleProof = wearableMetadata.merkleProof

  const entityHash = keccak256Hash(wearableMetadata, merkleProof.hashingKeys)
  if (entityHash !== merkleProof.entityHash) {
    return validationFailed(
      `The entity hash provided '${merkleProof.entityHash}' is different to the one calculated from the metadata '${entityHash}'`
    )
  }

  return OK
}

const SPRING_BONE_NAME_TOKEN = 'springbone'

function isSpringBoneName(name: string): boolean {
  return name.toLowerCase().includes(SPRING_BONE_NAME_TOKEN)
}

function formatErrorField(field: string): string {
  return field.length > 100
    ? JSON.stringify(field).slice(1, 100).concat('...')
    : JSON.stringify(field).slice(1, field.length + 1)
}

/**
 * Validate spring bones metadata when present on a wearable.
 *
 * Structural and per-parameter range checks are delegated to `SpringBonesData.validate`
 * from `@dcl/schemas`. This function only enforces invariants that the schema cannot
 * express on its own. */
export async function springBonesMetadataValidateFn(deployment: DeploymentToValidate): Promise<ValidationResponse> {
  const { entity } = deployment
  const wearableMetadata = entity.metadata as Wearable

  // Spring bones are optional — skip validation if not present
  const springBones = wearableMetadata?.data?.springBones
  if (!springBones) {
    return OK
  }

  const errors: string[] = []

  if (!SpringBonesData.validate(springBones)) {
    const schemaErrors = (SpringBonesData.validate.errors ?? []).map(
      (e) => `springBones${formatErrorField(e.instancePath)} ${e.message ?? 'is invalid'}`
    )
    return validationFailed(...schemaErrors)
  }

  // Build the set of content hashes that current representations point to.
  const representations = wearableMetadata.data?.representations ?? []
  const activeHashes = new Set<string>()
  for (const representation of representations) {
    const contentEntry = entity.content?.find((c) => c.file === representation.mainFile)
    if (contentEntry) {
      activeHashes.add(contentEntry.hash)
    }
  }

  for (const [modelHash, bones] of Object.entries(springBones.models)) {
    if (!activeHashes.has(modelHash)) {
      errors.push(
        `springBones.models key ${formatErrorField(modelHash)} does not match any current representation hash`
      )
    }
    for (const boneName of Object.keys(bones)) {
      if (!isSpringBoneName(boneName)) {
        errors.push(
          `Bone name ${formatErrorField(boneName)} in model ${formatErrorField(modelHash)} does not follow the spring bone naming convention`
        )
      }
    }
  }

  return errors.length > 0 ? validationFailed(...errors) : OK
}

/**
 * Validate that given wearable deployment includes the thumbnail and doesn't exceed file sizes
 * @public
 */
export const wearableValidateFn = validateIfTypeMatches(
  EntityType.WEARABLE,
  validateAll(
    wearableRepresentationContentValidateFn,
    thirdPartyWearableMerkleProofContentValidateFn,
    springBonesMetadataValidateFn
  )
)
