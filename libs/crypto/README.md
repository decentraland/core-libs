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
