// Regenerates the reference CIDs hard-coded in test/node.spec.ts.
// Run with: node libs/hashing/scripts/compute-reference-hashes.mjs

import { BlackHoleBlockstore } from 'blockstore-core'
import { fixedSize } from 'ipfs-unixfs-importer/chunker'
import { importer } from 'ipfs-unixfs-importer'
import { balanced } from 'ipfs-unixfs-importer/layout'

const PROD_CHUNK_SIZE = 262_144
const PROD_MAX_CHILDREN = 174

async function* deterministicStream(chunkCount, chunkSize) {
  for (let i = 0; i < chunkCount; i++) {
    const chunk = new Uint8Array(chunkSize)
    chunk[0] = i & 0xff
    chunk[1] = (i >>> 8) & 0xff
    chunk[2] = (i >>> 16) & 0xff
    chunk[3] = (i >>> 24) & 0xff
    yield chunk
  }
}

async function importerHash(chunkCount, { chunkSize, maxChildrenPerNode }) {
  const blockstore = new BlackHoleBlockstore()
  let lastCid
  for await (const { cid } of importer(
    [{ content: deterministicStream(chunkCount, chunkSize) }],
    blockstore,
    {
      cidVersion: 1,
      rawLeaves: true,
      chunker: fixedSize({ chunkSize }),
      layout: balanced({ maxChildrenPerNode })
    }
  )) {
    lastCid = cid
  }
  return lastCid.toString()
}

console.log('# production layout (chunkSize=262144, maxChildrenPerNode=174)')
for (const count of [175, 200, 348, 349]) {
  const cid = await importerHash(count, { chunkSize: PROD_CHUNK_SIZE, maxChildrenPerNode: PROD_MAX_CHILDREN })
  console.log(`${count}\t${cid}`)
}

console.log('\n# small-fanout layout (chunkSize=16, maxChildrenPerNode=3)')
for (const count of [4, 9, 10, 27, 28, 100]) {
  const cid = await importerHash(count, { chunkSize: 16, maxChildrenPerNode: 3 })
  console.log(`${count}\t${cid}`)
}
