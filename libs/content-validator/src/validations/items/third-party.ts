import { keccak256Hash } from '@dcl/hashing'
import type { ThirdPartyProps } from '@dcl/schemas'
import { isThirdParty } from '@dcl/schemas'
import { OK, validationFailed } from '../../types'
import type { DeploymentToValidate, ValidationResponse } from '../../types'

export async function thirdPartyMerkleProofContentValidateFn(
  deployment: DeploymentToValidate,
  requiredHashingKeys: readonly string[],
  itemLabel: string
): Promise<ValidationResponse> {
  const { entity } = deployment
  if (!isThirdParty(entity.metadata)) {
    return OK
  }

  const metadata = entity.metadata as ThirdPartyProps & { id: string }

  if (metadata.id.toLowerCase() !== entity.pointers[0].toLowerCase()) {
    return validationFailed(`The id '${metadata.id}' does not match the pointer '${entity.pointers[0]}'`)
  }

  const missingKey = requiredHashingKeys.find((key) => !metadata.merkleProof.hashingKeys.includes(key))
  if (missingKey) {
    return validationFailed(`The third-party ${itemLabel} merkle proof must commit the '${missingKey}' field`)
  }

  const allContentInFiles = Object.keys(metadata.content).every((content) => {
    const contentFile = entity.content.find((file) => file.file === content)
    if (!contentFile) {
      return false
    }
    return contentFile.hash === metadata.content[content]
  })
  const allFilesInContent = entity.content.every((content) => metadata.content[content.file] === content.hash)
  if (!allContentInFiles || !allFilesInContent) {
    return validationFailed('The content declared in the metadata does not match the files uploaded with the entity')
  }

  const { merkleProof } = metadata
  const entityHash = keccak256Hash(metadata, merkleProof.hashingKeys)
  if (entityHash !== merkleProof.entityHash) {
    return validationFailed(
      `The entity hash provided '${merkleProof.entityHash}' is different to the one calculated from the metadata '${entityHash}'`
    )
  }

  return OK
}
