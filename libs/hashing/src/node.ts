import { sha256 } from '@noble/hashes/sha256'
import { BlackHoleBlockstore } from 'blockstore-core'
import { importer } from 'ipfs-unixfs-importer'
import { CID } from 'multiformats/cid'
import { create } from 'multiformats/hashes/digest'

export type HashableContent = AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array

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
