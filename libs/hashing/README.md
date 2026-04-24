# @dcl/hashing

Hashing functions to calculate Decentraland Content Identifiers.

- `hashV1(arg): Promise<string>`: `ba` prefixed hashes are IPFSv1 hashes. Calculating hashes for files should generate the same result as an IPFS node.
- `hashV0(arg): Promise<string>`: `Qm` prefixed hashes are not IPFSv0 hashes, although they use the same encoding. This function is deprecated and kept for backwards compatibility.

```sh
npm i @dcl/hashing
```

```ts
import { hashV1 } from '@dcl/hashing'
import fs from 'node:fs'

const cidFromBuffer = await hashV1(fs.readFileSync('file'))
const cidFromStream = await hashV1(fs.createReadStream('file') as AsyncIterable<Uint8Array>)
```
