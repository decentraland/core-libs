import { encode, prepare } from '@ipld/dag-pb'
import { sha256 } from '@noble/hashes/sha256'
import { UnixFS } from 'ipfs-unixfs'
import { CID } from 'multiformats/cid'
import { create } from 'multiformats/hashes/digest'
import type { PBLink } from '@ipld/dag-pb'

// Local alias kept structurally identical to `LayoutInput` in ./node so the
// public type lives only in node.ts and this file's emitted .d.ts has no
// cross-file references (it's only generated for the test-helper bundle).
type LayoutInput = AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array

// Matches the defaults of ipfs-unixfs-importer's balanced layout so hashes are
// bit-compatible: fixed-size 262144-byte chunks, up to 174 children per node.
export const CHUNK_SIZE_BYTES = 262_144
export const MAX_CHILDREN_PER_NODE = 174

const SHA2_256_CODE = 0x12
const RAW_CODEC = 0x55
const DAG_PB_CODEC = 0x70

interface DagNode {
  cid: CID
  fileSize: bigint
  cumulativeSize: number
}

function isAsyncIterable(content: unknown): content is AsyncIterable<Uint8Array> {
  return (
    (typeof content === 'object' || typeof content === 'function') &&
    content !== null &&
    Symbol.asyncIterator in content
  )
}

// Realm-safe replacement for `content instanceof Uint8Array`, which fails for
// typed arrays created in another realm (e.g. a different iframe/worker/vm).
// Accepts any ArrayBuffer view (Uint8Array, Buffer, other TypedArrays) while
// still rejecting DataView and non-view values.
function isUint8ArrayLike(content: unknown): content is Uint8Array {
  return ArrayBuffer.isView(content) && !(content instanceof DataView)
}

function sha256Digest(data: Uint8Array) {
  return create(SHA2_256_CODE, sha256(data))
}

function rawLeaf(chunk: Uint8Array): DagNode {
  return {
    cid: CID.createV1(RAW_CODEC, sha256Digest(chunk)),
    fileSize: BigInt(chunk.length),
    cumulativeSize: chunk.length
  }
}

function buildParent(children: DagNode[]): DagNode {
  const file = new UnixFS({ type: 'file' })
  const links: PBLink[] = new Array(children.length)
  let cumulativeSize = 0
  let fileSize = 0n

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    file.addBlockSize(child.fileSize)
    links[i] = { Name: '', Tsize: child.cumulativeSize, Hash: child.cid }
    cumulativeSize += child.cumulativeSize
    fileSize += child.fileSize
  }

  const block = encode(prepare({ Data: file.marshal(), Links: links }))
  return {
    cid: CID.createV1(DAG_PB_CODEC, sha256Digest(block)),
    fileSize,
    cumulativeSize: cumulativeSize + block.length
  }
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

// Streaming balanced-tree builder. Mirrors the recursive batched algorithm used
// by ipfs-unixfs-importer's balanced layout, but folds completed levels into
// parents on the fly so memory stays bounded by tree depth × maxChildrenPerNode
// instead of the total number of leaves.
class BalancedTreeBuilder {
  private readonly levels: DagNode[][] = [[]]
  private leafCount = 0

  constructor(private readonly maxChildrenPerNode: number) {}

  addLeaf(chunk: Uint8Array): void {
    this.leafCount++
    this.pushAt(0, rawLeaf(chunk))
  }

  finalize(): DagNode {
    if (this.leafCount === 0) {
      return rawLeaf(new Uint8Array(0))
    }
    if (this.leafCount === 1) {
      return this.levels[0][0]
    }

    let carry: DagNode | undefined
    for (let i = 0; i < this.levels.length; i++) {
      const level = this.levels[i]
      if (carry !== undefined) level.push(carry)

      if (level.length === 0) {
        carry = undefined
        continue
      }

      // The topmost level with a single node is already a complete root
      // (e.g. all leaves fit under one balanced subtree, or stragglers were
      // promoted up to it). Mirrors ipfs-unixfs-importer's "return roots[0]
      // when roots.length === 1" guard, which avoids wrapping a single node
      // in a redundant unary parent. Lower levels with a single node still
      // get wrapped so the importer's "promote lone straggler up the tree"
      // shape is preserved.
      const isTopmost = i === this.levels.length - 1
      carry = isTopmost && level.length === 1 ? level[0] : buildParent(level)
    }

    if (carry === undefined) {
      throw new Error('hashV1: internal error — tree produced no root')
    }
    return carry
  }

  private pushAt(level: number, node: DagNode): void {
    if (level === this.levels.length) this.levels.push([])
    const bucket = this.levels[level]
    bucket.push(node)

    if (bucket.length === this.maxChildrenPerNode) {
      const parent = buildParent(bucket)
      bucket.length = 0
      this.pushAt(level + 1, parent)
    }
  }
}

async function hashChunks(
  chunks: Iterable<Uint8Array> | AsyncIterable<Uint8Array>,
  maxChildrenPerNode: number
): Promise<string> {
  const builder = new BalancedTreeBuilder(maxChildrenPerNode)
  for await (const chunk of chunks) {
    builder.addLeaf(chunk)
  }
  return builder.finalize().cid.toString()
}

/**
 * Internal entry point that exposes the UnixFS layout knobs so the balanced
 * tree can be exercised at small fan-outs (e.g. `maxChildrenPerNode: 3`) in
 * tests without needing the multi-GB inputs the production defaults would
 * otherwise require. Not part of the published surface — production callers
 * must use {@link hashV1}.
 */
export async function hashV1WithLayout(
  content: LayoutInput,
  options: { chunkSize: number; maxChildrenPerNode: number }
): Promise<string> {
  const { chunkSize, maxChildrenPerNode } = options

  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error(`Invalid chunkSize provided to hashV1. Expected an integer >= 1, received ${chunkSize}`)
  }

  if (!Number.isInteger(maxChildrenPerNode) || maxChildrenPerNode < 2) {
    throw new Error(
      `Invalid maxChildrenPerNode provided to hashV1. Expected an integer >= 2, received ${maxChildrenPerNode}`
    )
  }

  if (isUint8ArrayLike(content) && content.length <= chunkSize) {
    return CID.createV1(RAW_CODEC, sha256Digest(content)).toString()
  }

  if (isUint8ArrayLike(content)) {
    return hashChunks(chunksFromBuffer(content, chunkSize), maxChildrenPerNode)
  }

  if (isAsyncIterable(content)) {
    return hashChunks(chunksFromStream(content, chunkSize), maxChildrenPerNode)
  }

  throw new Error(
    'Invalid value provided to hashV1. Expected AsyncGenerator<Uint8Array> | AsyncIterable<Uint8Array> | Uint8Array'
  )
}
