import { keccak256Hash } from '@dcl/hashing'
import type { ThirdPartyProps } from '@dcl/schemas'
import { isThirdParty } from '@dcl/schemas'
import { OK, validationFailed } from '../../types'
import type { DeploymentToValidate, ValidationResponse } from '../../types'

// Shared third-party item binding for wearables and emotes. Binds the deployment to its approved merkle
// leaf: id matches the pointer, the required fields are committed by the proof, the uploaded files match
// the committed content, and the recomputed entity hash matches the one in the proof.
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

  // Check the id in the metadata matches the pointer being deployed
  if (metadata.id.toLowerCase() !== entity.pointers[0].toLowerCase()) {
    return validationFailed(`The id '${metadata.id}' does not match the pointer '${entity.pointers[0]}'`)
  }

  // Fields not in the hashing keys aren't committed by the leaf, so the checks below could be met with
  // attacker-chosen values unless they are required here
  const missingKey = requiredHashingKeys.find((key) => !metadata.merkleProof.hashingKeys.includes(key))
  if (missingKey) {
    return validationFailed(`The third-party ${itemLabel} merkle proof must commit the '${missingKey}' field`)
  }

  // Check the content files declared inside the metadata is exactly the same as the files uploaded with the entity
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

  // Re-create the entity hash and check it matches the one provided in the metadata
  const { merkleProof } = metadata
  const entityHash = keccak256Hash(metadata, merkleProof.hashingKeys)
  if (entityHash !== merkleProof.entityHash) {
    return validationFailed(
      `The entity hash provided '${merkleProof.entityHash}' is different to the one calculated from the metadata '${entityHash}'`
    )
  }

  return OK
}
