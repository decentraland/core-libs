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

Authorize a request by naming the action and canonical resource:

```typescript
const result = await Authenticator.authorizeSignature(payload, authChain, provider, {
  service: 'insights', operation: 'metrics-read', resource: 'world:example.dcl.eth'
})
if (!result.ok) throw new Error('Request not authorized')
// Perform ownership checks and data access using result.resource.
```

### Scoped identity validation versus action authorization

`Authenticator.validateSignature` validates signatures or a stored scoped identity
against its ephemeral address. Its `ok: true` result is not permission to act.
Request callers must use `authorizeSignature` as above, or explicitly enforce the
operation and canonical resource before acting. `authorizeSignature` snapshots
the requested action and exposes the checked resource read-only in its result.
`isOperationGranted` remains available for explicit checks; an undefined scope
means a full login, which grants every operation.

Scoped validation defaults to a 24-hour maximum remaining validity. A positive
`maxScopedLoginLifetimeInMillis` explicitly overrides that policy. Returned
`scope.expiration` is the earliest expiration of all delegation links; derived
sessions must not outlive it. This bounds remaining validity, not age since issuance.

Clients must warn that `service:*` includes all future operations, and prefer
explicit grants for single-purpose clients. Grants have no audience/environment
binding: environments sharing a service identifier share the credential. Use
separate service identifiers when isolation is required. Consumers validating auth
chains with schemas need support for the new link types before adoption.

Full-login payload parsing must reject scoped payloads even if their link is
retyped as `ECDSA_EPHEMERAL`: the distinct `Ephemeral:` field protects that case.
