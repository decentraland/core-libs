import { encode, prepare } from '@ipld/dag-pb'
import { sha256 } from '@noble/hashes/sha256'
import { UnixFS } from 'ipfs-unixfs'
import { CID } from 'multiformats/cid'
import { create } from 'multiformats/hashes/digest'
import type { PBLink } from '@ipld/dag-pb'

export type HashableContent = AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array

// Matches the defaults of ipfs-unixfs-importer so hashes are bit-compatible:
// fixed-size chunks of 262144 bytes, up to 174 children in a flat parent.
const CHUNK_SIZE_BYTES = 262_144
const MAX_FLAT_CHILDREN = 174
const SHA2_256_CODE = 0x12
const RAW_CODEC = 0x55
const DAG_PB_CODEC = 0x70

function isAsyncIterable(content: unknown): content is AsyncIterable<Uint8Array> {
  return (
    (typeof content === 'object' || typeof content === 'function') &&
    content !== null &&
    Symbol.asyncIterator in content
  )
}

function sha256Digest(data: Uint8Array) {
  return create(SHA2_256_CODE, sha256(data))
}

function rawLeafCid(data: Uint8Array): CID {
  return CID.createV1(RAW_CODEC, sha256Digest(data))
}

function* chunksFromBuffer(content: Uint8Array, chunkSize: number): Generator<Uint8Array> {
  for (let offset = 0; offset < content.length; offset += chunkSize) {
    yield content.subarray(offset, Math.min(offset + chunkSize, content.length))
  }
}

async function* chunksFromStream(content: AsyncIterable<Uint8Array>, chunkSize: number): AsyncGenerator<Uint8Array> {
  const pending: Uint8Array[] = []
  let pendingBytes = 0

  for await (const incoming of content) {
    if (incoming.length === 0) continue
    pending.push(incoming)
    pendingBytes += incoming.length

    while (pendingBytes >= chunkSize) {
      const chunk = new Uint8Array(chunkSize)
      let written = 0
      while (written < chunkSize) {
        const head = pending[0]
        const needed = chunkSize - written
        if (head.length <= needed) {
          chunk.set(head, written)
          written += head.length
          pending.shift()
        } else {
          chunk.set(head.subarray(0, needed), written)
          pending[0] = head.subarray(needed)
          written += needed
        }
      }
      pendingBytes -= chunkSize
      yield chunk
    }
  }

  if (pendingBytes > 0) {
    const chunk = new Uint8Array(pendingBytes)
    let written = 0
    for (const part of pending) {
      chunk.set(part, written)
      written += part.length
    }
    yield chunk
  }
}

async function hashChunks(chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>): Promise<string> {
  const file = new UnixFS({ type: 'file' })
  const links: PBLink[] = []

  for await (const chunk of chunks) {
    if (links.length >= MAX_FLAT_CHILDREN) {
      const limitMb = ((MAX_FLAT_CHILDREN * CHUNK_SIZE_BYTES) / (1024 * 1024)).toFixed(1)
      throw new Error(`hashV1: content exceeds flat-parent limit of ${MAX_FLAT_CHILDREN} chunks (~${limitMb} MB)`)
    }
    const cid = rawLeafCid(chunk)
    file.addBlockSize(BigInt(chunk.length))
    links.push({ Name: '', Tsize: chunk.length, Hash: cid })
  }

  if (links.length === 0) {
    throw new Error('hashV1: no content was provided')
  }

  if (links.length === 1) {
    return (links[0].Hash as CID).toString()
  }

  const block = encode(prepare({ Data: file.marshal(), Links: links }))
  return CID.createV1(DAG_PB_CODEC, sha256Digest(block)).toString()
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
  if (content instanceof Uint8Array && content.length <= CHUNK_SIZE_BYTES) {
    return rawLeafCid(content).toString()
  }

  if (content instanceof Uint8Array) {
    return hashChunks(chunksFromBuffer(content, CHUNK_SIZE_BYTES))
  }

  if (isAsyncIterable(content)) {
    return hashChunks(chunksFromStream(content, CHUNK_SIZE_BYTES))
  }

  throw new Error(
    'Invalid value provided to hashV1. Expected AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array'
  )
}
