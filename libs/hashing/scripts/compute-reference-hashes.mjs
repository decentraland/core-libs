// Regenerates the reference CIDs hard-coded in test/node.spec.ts.
// Run with: node libs/hashing/scripts/compute-reference-hashes.mjs

import { BlackHoleBlockstore } from 'blockstore-core'
import { importer } from 'ipfs-unixfs-importer'

const CHUNK_SIZE_BYTES = 262_144

async function* deterministicStream(chunkCount) {
  for (let i = 0; i < chunkCount; i++) {
    const chunk = new Uint8Array(CHUNK_SIZE_BYTES)
    chunk[0] = i & 0xff
    chunk[1] = (i >>> 8) & 0xff
    chunk[2] = (i >>> 16) & 0xff
    chunk[3] = (i >>> 24) & 0xff
    yield chunk
  }
}

async function importerHash(chunkCount) {
  const blockstore = new BlackHoleBlockstore()
  let lastCid
  for await (const { cid } of importer([{ content: deterministicStream(chunkCount) }], blockstore, {
    cidVersion: 1,
    rawLeaves: true
  })) {
    lastCid = cid
  }
  return lastCid.toString()
}

const chunkCounts = [175, 200, 348, 349]

for (const count of chunkCounts) {
  const cid = await importerHash(count)
  console.log(`${count}\t${cid}`)
}
