import { AuthLinkType } from './types'
import type { AuthChain, ScopedLoginGrant, ScopedLoginScope } from './types'

/**
 * Link types of a scoped login (ADR-162). They are not part of `@dcl/schemas`' `AuthLinkType` yet,
 * so verifiers that predate them reject a scoped chain: schema validation refuses the type, and
 * `validateSignature` validates an unknown type as an error.
 */
export const ScopedAuthLinkType = {
  ECDSA_PERSONAL_SCOPED_EPHEMERAL: 'ECDSA_SCOPED_EPHEMERAL',
  ECDSA_EIP_1654_SCOPED_EPHEMERAL: 'ECDSA_EIP_1654_SCOPED_EPHEMERAL'
} as const

export type ScopedAuthLinkType = (typeof ScopedAuthLinkType)[keyof typeof ScopedAuthLinkType]

/** First line of a scoped login message. Distinct from "Decentraland Login", so one never parses as the other. */
export const SCOPED_LOGIN_PREFIX = 'Decentraland Scoped Login'
export const MAX_SCOPED_LOGIN_GRANTS = 32
export const MAX_SCOPED_LOGIN_PAYLOAD_BYTES = 4096

/** Identifier of a service, e.g. `insights`. Shared by every environment of the service. */
export const SERVICE_FORMAT = /^[a-z0-9-]{1,64}$/
/** An operation of a service, or `*` for all of them. */
export const OPERATION_FORMAT = /^(?:[a-z0-9-]{1,64}|\*)$/
/** A resource of a service: visible ASCII, no whitespace. Services should write it as `<kind>:<value>`. */
export const RESOURCE_FORMAT = /^[\x21-\x7e]{1,256}$/

const EPHEMERAL_FORMAT = /^0x[0-9a-f]{40}$/
const EPHEMERAL_PREFIX = 'Ephemeral: '
const EXPIRATION_PREFIX = 'Expiration: '
const GRANT_LINE = /^Allow: ([a-z0-9-]{1,64}):([a-z0-9-]{1,64}|\*)(?: for ([\x21-\x7e]{1,256}))?$/

export interface ParsedScopedEphemeralPayload {
  /** Lowercase address of the key the login delegates to. */
  ephemeralAddress: string
  /** Unix millis. */
  expiration: number
  /** Every grant, for every service. */
  grants: ScopedLoginGrant[]
}

export function isScopedAuthLinkType(type: string): type is ScopedAuthLinkType {
  return (
    type === ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL ||
    type === ScopedAuthLinkType.ECDSA_EIP_1654_SCOPED_EPHEMERAL
  )
}

function grantLine({ service, operation, resource }: ScopedLoginGrant): string {
  return `Allow: ${service}:${operation}${resource === undefined ? '' : ` for ${resource}`}`
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/**
 * Builds the message a wallet (or a key holding a full login) signs to delegate only `grants` to an
 * ephemeral key:
 *
 *   Decentraland Scoped Login
 *   Ephemeral: 0x<lowercase address>
 *   Expiration: <ISO-8601>
 *   Allow: <service>:<operation>[ for <resource>]
 *
 * @throws Error if the address, the expiration or a grant is malformed, a grant is repeated, there
 *   are no grants or more than `MAX_SCOPED_LOGIN_GRANTS`, or the message exceeds
 *   `MAX_SCOPED_LOGIN_PAYLOAD_BYTES`.
 */
export function getScopedEphemeralMessage(
  ephemeralAddress: string,
  expiration: Date,
  grants: ScopedLoginGrant[]
): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(ephemeralAddress)) {
    throw new Error('Invalid scoped login ephemeral address')
  }
  if (!Number.isFinite(expiration.getTime())) {
    throw new Error('Invalid scoped login expiration')
  }
  if (grants.length === 0 || grants.length > MAX_SCOPED_LOGIN_GRANTS) {
    throw new Error(`A scoped login needs between 1 and ${MAX_SCOPED_LOGIN_GRANTS} grants`)
  }

  const lines = grants.map((grant) => {
    if (
      !SERVICE_FORMAT.test(grant.service) ||
      !OPERATION_FORMAT.test(grant.operation) ||
      (grant.resource !== undefined && !RESOURCE_FORMAT.test(grant.resource))
    ) {
      throw new Error('Invalid scoped login grant')
    }
    return grantLine(grant)
  })
  if (new Set(lines).size !== lines.length) {
    throw new Error('Repeated scoped login grant')
  }

  const message = [
    SCOPED_LOGIN_PREFIX,
    `${EPHEMERAL_PREFIX}${ephemeralAddress.toLowerCase()}`,
    `${EXPIRATION_PREFIX}${expiration.toISOString()}`,
    ...lines
  ].join('\n')
  if (byteLength(message) > MAX_SCOPED_LOGIN_PAYLOAD_BYTES) {
    throw new Error(`A scoped login message cannot exceed ${MAX_SCOPED_LOGIN_PAYLOAD_BYTES} bytes`)
  }
  return message
}

/**
 * Parses a scoped login message strictly: the prefix, `Ephemeral` and `Expiration` lines in that
 * order, then 1 to `MAX_SCOPED_LOGIN_GRANTS` distinct `Allow` lines, separated by single LFs. Values
 * are compared as written: nothing is trimmed or case-folded, and only the exact
 * `Date#toISOString()` form of the expiration is accepted.
 *
 * @throws Error on any deviation.
 */
export function parseScopedEphemeralPayload(payload: string): ParsedScopedEphemeralPayload {
  if (byteLength(payload) > MAX_SCOPED_LOGIN_PAYLOAD_BYTES || payload.includes('\r')) {
    throw new Error('Invalid scoped login payload')
  }

  const [prefix, ephemeralLine, expirationLine, ...grantLines] = payload.split('\n')
  if (
    prefix !== SCOPED_LOGIN_PREFIX ||
    !ephemeralLine?.startsWith(EPHEMERAL_PREFIX) ||
    !expirationLine?.startsWith(EXPIRATION_PREFIX) ||
    grantLines.length === 0 ||
    grantLines.length > MAX_SCOPED_LOGIN_GRANTS ||
    new Set(grantLines).size !== grantLines.length
  ) {
    throw new Error('Invalid scoped login payload')
  }

  const ephemeralAddress = ephemeralLine.slice(EPHEMERAL_PREFIX.length)
  if (!EPHEMERAL_FORMAT.test(ephemeralAddress)) {
    throw new Error('Invalid scoped login ephemeral address')
  }

  // Date.parse alone accepts non-ISO forms; only the canonical form round-trips.
  const expirationText = expirationLine.slice(EXPIRATION_PREFIX.length)
  const expiration = Date.parse(expirationText)
  if (!Number.isFinite(expiration) || new Date(expiration).toISOString() !== expirationText) {
    throw new Error('Invalid scoped login expiration')
  }

  const grants = grantLines.map((line) => {
    const match = GRANT_LINE.exec(line)
    if (!match) {
      throw new Error('Invalid scoped login grant')
    }
    const [, service, operation, resource] = match
    return resource === undefined ? { service, operation } : { service, operation, resource }
  })

  return { ephemeralAddress, expiration, grants }
}

/**
 * Checks the structure ADR-162 requires of a chain with a scoped link: a SIGNER, then any number of
 * full-login ephemeral links, then exactly one scoped link, then at most one ECDSA_SIGNED_ENTITY
 * link. Without it, the chain is the scoped identity itself, whose final authority is the ephemeral
 * address. A contract-wallet scoped link must follow the SIGNER directly.
 *
 * @returns The index of the scoped link, or undefined when the chain has none.
 * @throws Error when the chain has a scoped link and another structure.
 */
export function findScopedLink(authChain: AuthChain): number | undefined {
  const scoped = authChain.flatMap((link, index) => (isScopedAuthLinkType(link.type) ? [index] : []))
  if (scoped.length === 0) {
    return undefined
  }

  const index = scoped[0]
  const last = authChain.length - 1
  const delegations = authChain.slice(1, index)
  if (
    scoped.length > 1 ||
    (index !== last && (index !== last - 1 || authChain[last].type !== AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY)) ||
    !delegations.every(
      (link) =>
        link.type === AuthLinkType.ECDSA_PERSONAL_EPHEMERAL || link.type === AuthLinkType.ECDSA_EIP_1654_EPHEMERAL
    ) ||
    ((authChain[index].type as string) === ScopedAuthLinkType.ECDSA_EIP_1654_SCOPED_EPHEMERAL && index !== 1)
  ) {
    throw new Error(
      'Invalid scoped login chain: a scoped link must be the only one, and only an ECDSA_SIGNED_ENTITY link may follow it'
    )
  }
  return index
}

/**
 * Whether a scope allows an operation, optionally on a resource. A grant allows it when its
 * operation is the same or `*`, and it either names no resource or names this one.
 *
 * @param scope - The scope a verification returned; undefined for a full login, which allows everything.
 * @param operation - The operation the request performs; `*` is not an operation.
 * @param resource - The resource the request acts on, if any.
 */
export function isOperationGranted(scope: ScopedLoginScope | undefined, operation: string, resource?: string): boolean {
  if (scope === undefined) {
    return true
  }
  if (operation === '*' || !OPERATION_FORMAT.test(operation)) {
    return false
  }
  return scope.grants.some(
    (grant) =>
      (grant.operation === operation || grant.operation === '*') &&
      (grant.resource === undefined || grant.resource === resource)
  )
}
