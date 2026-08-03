# @dcl/crypto

Crypto auth for Decentraland. Provides `Authenticator` utilities, signature validation, and authentication chain helpers used across Decentraland services and clients.

## Install

```bash
pnpm add @dcl/crypto
```

Requires Node.js >= 24.

## Entry points

```typescript
// Authenticator, auth-chain helpers, signature validation, types
import { Authenticator } from '@dcl/crypto'

// Lower-level primitives: sign, ethSign, recoverPublicKey,
// recoverAddressFromEthSignature, computeAddress, createUnsafeIdentity
import { ethSign, recoverAddressFromEthSignature } from '@dcl/crypto/crypto'
```

`@dcl/crypto/crypto` replaces the previously reachable deep path
`@dcl/crypto/dist/crypto`, which the package's `exports` map no longer resolves.

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
