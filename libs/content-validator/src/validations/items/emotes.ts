import { keccak256Hash } from '@dcl/hashing'
import type { Emote, ThirdPartyProps } from '@dcl/schemas'
import { EntityType, OutcomeGroup, StartAnimation, isThirdParty } from '@dcl/schemas'
import { OK, validationFailed } from '../../types'
import { ADR_74_TIMESTAMP } from '../timestamps'
import { validateAll, validateIfTypeMatches } from '../validations'
import type { DeploymentToValidate, ValidationResponse } from '../../types'

const MAX_SOCIAL_EMOTE_OUTCOMES = 3

export async function wasCreatedAfterADR74ValidateFn(deployment: DeploymentToValidate): Promise<ValidationResponse> {
  return deployment.entity.timestamp < ADR_74_TIMESTAMP
    ? validationFailed(
        `The emote timestamp ${deployment.entity.timestamp} is before ADR 74. Emotes did not exist before ADR 74.`
      )
    : OK
}

export async function emoteRepresentationContentValidateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const { entity } = deployment
  const metadata = entity.metadata as Emote
  const representations = metadata?.emoteDataADR74?.representations
  if (!representations || representations.length === 0) return validationFailed('No emote representations found')
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

export async function emoteADR287ValidateFn(deployment: DeploymentToValidate): Promise<ValidationResponse> {
  const { entity } = deployment
  const metadata = entity.metadata as Emote
  const data = metadata?.emoteDataADR74

  if (!data) {
    return validationFailed('No emote data found')
  }

  // Check for social emote properties
  const requiredProperties = ['startAnimation', 'randomizeOutcomes', 'outcomes'] as const
  const presentProperties = requiredProperties.filter((prop) => data[prop] !== undefined)

  // Not a social emote if no properties are present
  if (presentProperties.length === 0) {
    return OK
  }

  if (presentProperties.length < requiredProperties.length) {
    const missingProperties = requiredProperties.filter((prop) => data[prop] === undefined)
    return validationFailed(
      `For social emote definition, all properties must be present. Missing: ${missingProperties.join(', ')}`
    )
  }

  const { startAnimation, outcomes } = data

  // Validate startAnimation
  if (!StartAnimation.validate(startAnimation)) {
    return validationFailed('Some properties of StartAnimation are not valid')
  }

  // Validate outcomes length
  if (!outcomes || outcomes.length === 0) {
    return validationFailed('Outcomes array cannot be empty')
  }

  if (outcomes.length > MAX_SOCIAL_EMOTE_OUTCOMES) {
    return validationFailed(`Outcomes array can contain up to ${MAX_SOCIAL_EMOTE_OUTCOMES} items`)
  }

  // Validate each outcome
  for (const outcome of outcomes) {
    if (!OutcomeGroup.validate(outcome)) {
      return validationFailed('Some properties of Outcome are not valid')
    }
  }

  return OK
}

// Emote counterpart of `thirdPartyWearableMerkleProofContentValidateFn`. Requiring `emoteDataADR74`
// in the hashing keys also blocks replaying a wearable leaf (whose keys omit it) as an emote.
const REQUIRED_THIRD_PARTY_EMOTE_HASHING_KEYS = ['id', 'content', 'emoteDataADR74'] as const

export async function thirdPartyEmoteMerkleProofContentValidateFn(
  deployment: DeploymentToValidate
): Promise<ValidationResponse> {
  const { entity } = deployment
  if (!isThirdParty(entity.metadata)) {
    return OK
  }

  const emoteMetadata = entity.metadata as Emote & ThirdPartyProps

  // Check the id in the metadata matches the pointer being deployed
  if (emoteMetadata.id.toLowerCase() !== entity.pointers[0].toLowerCase()) {
    return validationFailed(`The id '${emoteMetadata.id}' does not match the pointer '${entity.pointers[0]}'`)
  }

  // Fields not in the hashing keys aren't committed by the leaf, so the checks below could be met with
  // attacker-chosen values unless they are required here
  const missingKey = REQUIRED_THIRD_PARTY_EMOTE_HASHING_KEYS.find(
    (key) => !emoteMetadata.merkleProof.hashingKeys.includes(key)
  )
  if (missingKey) {
    return validationFailed(`The third-party emote merkle proof must commit the '${missingKey}' field`)
  }

  // Check the content files declared inside the metadata is exactly the same as the files uploaded with the entity
  const allContentInFiles = Object.keys(emoteMetadata.content).every((content) => {
    const contentFile = entity.content.find((file) => file.file === content)
    if (!contentFile) {
      return false
    }
    return contentFile.hash === emoteMetadata.content[content]
  })

  const allFilesInContent = entity.content.every((content) => {
    return emoteMetadata.content[content.file] === content.hash
  })
  if (!allContentInFiles || !allFilesInContent) {
    return validationFailed('The content declared in the metadata does not match the files uploaded with the entity')
  }

  // Re-create the entity hash and check it matches the one provided in the metadata
  const merkleProof = emoteMetadata.merkleProof
  const entityHash = keccak256Hash(emoteMetadata, merkleProof.hashingKeys)
  if (entityHash !== merkleProof.entityHash) {
    return validationFailed(
      `The entity hash provided '${merkleProof.entityHash}' is different to the one calculated from the metadata '${entityHash}'`
    )
  }

  return OK
}

export const emoteValidateFn = validateIfTypeMatches(
  EntityType.EMOTE,
  validateAll(
    wasCreatedAfterADR74ValidateFn,
    emoteRepresentationContentValidateFn,
    emoteADR287ValidateFn,
    thirdPartyEmoteMerkleProofContentValidateFn
  )
)
