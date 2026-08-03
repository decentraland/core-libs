# `@dcl/http-commons`

Common middlewares and utilities for HTTP servers built on top of [`@well-known-components`](https://github.com/well-known-components). Provides reusable error types, request handlers, and helpers for paginated endpoints, JSON parsing, and Ethereum address handling.

## Installation

```bash
pnpm add @dcl/http-commons
```

### Prerequisites

- **Node.js**: `>=24.0.0`
- Peer-style usage with `@well-known-components/interfaces` (already a dependency)

## Errors

Typed exceptions intended to be thrown from controllers/logic and translated to HTTP responses by the `errorHandler` middleware.

```typescript
import {
  InvalidRequestError,
  NotFoundError,
  NotAuthorizedError,
  HTTPResponseError
} from '@dcl/http-commons'
```

| Error | Mapped status (via `errorHandler`) |
|-------|------------------------------------|
| `InvalidRequestError` | `400 Bad request` |
| `NotFoundError` | `404 Not Found` |
| `NotAuthorizedError` | `401 Not Authorized` |
| `HTTPResponseError` | wraps a `node-fetch` `Response` for outbound HTTP failures |

Anything else thrown is logged and returned as `500 Internal Server Error`.

## Middlewares

### `errorHandler`

Catches typed errors from downstream handlers and converts them into structured HTTP responses. Requires a `logs` component on the request context.

```typescript
import { errorHandler } from '@dcl/http-commons'

router.use(errorHandler)
```

### `bearerTokenMiddleware`

Validates the `Authorization: Bearer <token>` header against a shared secret using a constant-time comparison. Throws `NotAuthorizedError` on missing or invalid tokens.

```typescript
import { bearerTokenMiddleware } from '@dcl/http-commons'

router.use('/internal', bearerTokenMiddleware(process.env.AUTH_SECRET!))
```

### `ethAddressNormalizerMiddleware`

Lowercases any URL parameter whose value is a valid Ethereum address, so route handlers don't have to normalize addresses themselves.

```typescript
import { ethAddressNormalizerMiddleware } from '@dcl/http-commons'

router.use(ethAddressNormalizerMiddleware())
```

## Utilities

### `getPaginationParams`

Parses `limit` and `offset` from a `URLSearchParams`. `limit` must be a positive integer ≤ `100`; missing, zero, negative, or out-of-range values fall back to `100`. `offset` defaults to `0` if missing or negative.

```typescript
import { getPaginationParams } from '@dcl/http-commons'

const { limit, offset } = getPaginationParams(new URL(ctx.url).searchParams)
```

### `parseJson`

Reads and parses a JSON body, throwing `InvalidRequestError('Invalid body')` on failure (so it surfaces as `400` via `errorHandler`).

```typescript
import { parseJson } from '@dcl/http-commons'

const payload = await parseJson<MyDto>(ctx.request)
```

### `generateRandomWalletAddress` / `generateRandomWalletAddresses`

Generates one or many random `0x`-prefixed 20-byte addresses. Useful for tests and fixtures.

```typescript
import { generateRandomWalletAddress, generateRandomWalletAddresses } from '@dcl/http-commons'

const address = generateRandomWalletAddress()
const addresses = generateRandomWalletAddresses(5)
```

## Project Structure

```
src/
├── index.ts                   # Public entry point
├── errors.ts                  # Typed HTTP errors
├── types.ts                   # Shared context types
├── adapters/
│   └── pagination.ts          # getPaginationParams
├── controllers/
│   └── handlers/
│       ├── error-handler.ts             # errorHandler
│       ├── bearer-token-middleware.ts   # bearerTokenMiddleware
│       └── eth-address-normalizer-middleware.ts
└── utils/
    ├── parsing.ts             # parseJson
    └── wallet.ts              # generateRandomWalletAddress(es)
```

## Development

From the monorepo root:

```bash
pnpm install
pnpm --filter @dcl/http-commons build
pnpm --filter @dcl/http-commons test
```
