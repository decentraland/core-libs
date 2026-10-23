# @dcl/crypto

Crypto auth for Decentraland. Provides `Authenticator` utilities, signature validation, and authentication chain helpers used across Decentraland services and clients.

## Install

```bash
pnpm add @dcl/crypto
```

## Create a new Identity using Ethers

```typescript
import { Authenticator, AuthIdentity } from '@dcl/crypto'
import { Wallet } from '@ethersproject/wallet'
import { Web3Provider, ExternalProvider } from '@ethersproject/providers'

/**
 * @param provider   - any ethereum provider (e.g. window.ethereum)
 * @param expiration - ttl in minutes of the identity
 */
export async function createIdentity(
  provider: ExternalProvider,
  expiration: number
): Promise<AuthIdentity> {
  const signer = new Web3Provider(provider).getSigner()
  const address = await signer.getAddress()

  const wallet = Wallet.createRandom()
  const payload = {
    address: wallet.address,
    privateKey: wallet.privateKey,
    publicKey: wallet.publicKey
  }

  return Authenticator.initializeAuthChain(
    address,
    payload,
    expiration,
    (message) => new Web3Provider(provider).getSigner().signMessage(message)
  )
}
```

## Create a scoped identity

A scoped login ([ADR-162](https://adr.decentraland.org/adr/ADR-162)) delegates only the listed operations to the ephemeral key. Only services that opt in and are named in the grants accept it; every other verifier rejects it.

```typescript
const identity = await Authenticator.initializeScopedAuthChain(
  address,
  ephemeral,
  60,
  [
    { service: 'insights', operation: 'logs-read' },
    { service: 'insights', operation: 'metrics-read', resource: 'world:example.dcl.eth' }
  ],
  (message) => signer.signMessage(message)
)
```

A verifier passes its service identifier to `validateSignature`, and checks each operation against the returned scope:

```typescript
const result = await Authenticator.validateSignature(payload, authChain, provider, Date.now(), { service: 'insights' })
if (result.ok && !isOperationGranted(result.scope, 'logs-read')) {
  // the login doesn't allow this operation
}
```

`result.scope` is undefined for a full login, which `isOperationGranted` allows everything.
