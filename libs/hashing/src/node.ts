import { sha256 } from '@noble/hashes/sha2.js'
import { CID } from 'multiformats/cid'
import { create } from 'multiformats/hashes/digest'
import { CHUNK_SIZE_BYTES, MAX_CHILDREN_PER_NODE, hashV1WithLayout } from './_layout'

export type HashableContent = AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array

const SHA2_256_CODE = 0x12

function isAsyncIterable(content: unknown): content is AsyncIterable<Uint8Array> {
  return (
    (typeof content === 'object' || typeof content === 'function') &&
    content !== null &&
    Symbol.asyncIterator in content
  )
}

/**
 * Calculates a Qm prefixed hash for Decentraland (NOT CIDv0) from a readable stream
 *
 * @public
 * @deprecated use hashV1 instead, this function exists for backwards compatibility reasons.
 */
export async function hashV0(stream: HashableContent): Promise<string> {
  const hash = sha256.create()

  if (stream instanceof Uint8Array) {
    hash.update(stream)
  } else if (isAsyncIterable(stream)) {
    for await (const chunk of stream) {
      hash.update(chunk)
    }
  } else {
    throw new Error(
      'Invalid value provided to hashV0. Expected AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array'
    )
  }

  return CID.createV0(create(SHA2_256_CODE, hash.digest())).toString()
}

/**
 * Calculates a CIDv1 from a readable stream
 * @public
 */
export async function hashV1(content: HashableContent): Promise<string> {
  return hashV1WithLayout(content, {
    chunkSize: CHUNK_SIZE_BYTES,
    maxChildrenPerNode: MAX_CHILDREN_PER_NODE
  })
}
