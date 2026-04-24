import { sha256 } from '@noble/hashes/sha256'
import { BlackHoleBlockstore } from 'blockstore-core'
import { importer } from 'ipfs-unixfs-importer'
import { CID } from 'multiformats/cid'
import { create } from 'multiformats/hashes/digest'

export type HashableContent = AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array

// Matches the default maxChunkSize of ipfs-unixfs-importer; content at or below
// this size produces a single raw leaf CID, which we can compute directly.
const SINGLE_CHUNK_MAX_BYTES = 262_144
const SHA2_256_CODE = 0x12
const RAW_CODEC = 0x55

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

  return CID.createV0(create(0x12, hash.digest())).toString()
}

/**
 * Calculates a CIDv1 from a readable stream
 * @public
 */
export async function hashV1(content: HashableContent): Promise<string> {
  if (content instanceof Uint8Array && content.length <= SINGLE_CHUNK_MAX_BYTES) {
    const digest = create(SHA2_256_CODE, sha256(content))
    return CID.createV1(RAW_CODEC, digest).toString()
  }

  const blockstore = new BlackHoleBlockstore()

  let lastCid: CID | undefined

  async function* wrap() {
    yield content as Uint8Array
  }

  if (content instanceof Uint8Array) {
    for await (const { cid } of importer([{ content: wrap() }], blockstore, {
      cidVersion: 1,
      rawLeaves: true
    })) {
      lastCid = cid
    }
  } else if (isAsyncIterable(content)) {
    for await (const { cid } of importer([{ content }], blockstore, {
      cidVersion: 1,
      rawLeaves: true
    })) {
      lastCid = cid
    }
  } else {
    throw new Error(
      'Invalid value provided to hashV1. Expected AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array'
    )
  }

  if (!lastCid) {
    throw new Error('hashV1: importer produced no CID for the given content')
  }

  return lastCid.toString()
}
