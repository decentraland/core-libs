import { adr45ValidateFn } from './ADR45'
import { allHashesInUploadedFilesAreReportedInTheEntityValidateFn, createContentValidateFn } from './content'
import { entityStructureValidationFn } from './entity-structure'
import { ipfsHashingValidateFn } from './ipfs-hashing'
import { emoteValidateFn } from './items/emotes'
import { wearableValidateFn } from './items/wearables'
import { metadataValidateFn } from './metadata-schema'
import { createOutfitsValidateFn } from './outfits'
import { createProfileValidateFn } from './profile'
import { sceneValidateFn } from './scene'
import { createSignatureValidateFn } from './signature'
import { createSizeValidateFn } from './size'
import type { ContentValidatorComponents, DeploymentToValidate, ExternalCalls, ValidateFn } from '../types'

/**
 * @public
 */
export async function calculateDeploymentSize(
  deployment: DeploymentToValidate,
  externalCalls: ExternalCalls
): Promise<number | string> {
  let totalSize = 0
  // Files not already uploaded need their size fetched from storage; collect them and fetch below.
  const hashesToFetch: string[] = []
  for (const hash of new Set(deployment.entity.content?.map((item) => item.hash) ?? [])) {
    const uploadedFile = deployment.files.get(hash)
    if (uploadedFile) {
      totalSize += uploadedFile.byteLength
    } else {
      hashesToFetch.push(hash)
    }
  }
  // Fetch in batches of `fetchContentFileSizeConcurrency` (default 1 = sequential, the previous
  // behavior). A caller can raise it to parallelize, and the batching keeps a large content list from
  // fanning out into an unbounded number of concurrent storage operations.
  // `|| 1` (not `?? 1`) so a 0, negative, or NaN value falls back to 1 rather than degenerating the
  // loop (a NaN batch size would slice to an empty batch and silently skip every unfetched hash).
  const concurrency = Math.max(1, externalCalls.fetchContentFileSizeConcurrency || 1)
  for (let i = 0; i < hashesToFetch.length; i += concurrency) {
    const batch = hashesToFetch.slice(i, i + concurrency)
    const fetchedSizes = await Promise.all(batch.map((hash) => externalCalls.fetchContentFileSize(hash)))
    for (let j = 0; j < fetchedSizes.length; j++) {
      const contentSize = fetchedSizes[j]
      if (contentSize === undefined) return `Couldn't fetch content file with hash: ${batch[j]}`
      totalSize += contentSize
    }
  }
  return totalSize
}

/**
 * @public
 */
export function createValidateFns(components: ContentValidatorComponents): ValidateFn[] {
  return [
    // Stateless validations that are run on a deployment.
    entityStructureValidationFn,
    ipfsHashingValidateFn,
    metadataValidateFn,
    adr45ValidateFn,

    // Stateful validations that are run on a deployment.
    createSignatureValidateFn(components),
    createSizeValidateFn(components),
    wearableValidateFn,
    emoteValidateFn,
    createProfileValidateFn(components),
    sceneValidateFn,
    createContentValidateFn(components),
    createOutfitsValidateFn(components)
  ]
}

/**
 * The validations that apply to a partial (staging) deployment — everything checkable BEFORE all of the
 * entity's content is present. Intended for multi-request uploads that stage content across several
 * requests. Deliberately excludes, versus {@link createValidateFns}:
 *  - the size validation — a staging caller enforces a cumulative size budget across requests instead;
 *  - content completeness — only checkable once every referenced file is present (checked at finalize
 *    via the full {@link createValidateFns}); the "no extra/unreferenced files" half is kept here;
 *  - the access check — appended separately (see {@link createStagingValidator}'s `includeAccessCheck`),
 *    since it is the expensive on-chain/subgraph call and may be skipped on a trusted resume request.
 *
 * Non-scene type validations are omitted: `sceneValidateFn` self-guards to scene entities, and staging
 * is only used for scenes.
 * @public
 */
export function createStagingValidateFns(components: ContentValidatorComponents): ValidateFn[] {
  return [
    entityStructureValidationFn,
    ipfsHashingValidateFn,
    metadataValidateFn,
    adr45ValidateFn,
    createSignatureValidateFn(components),
    sceneValidateFn,
    allHashesInUploadedFilesAreReportedInTheEntityValidateFn
  ]
}
