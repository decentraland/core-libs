// eslint-disable-next-line import/no-named-as-default
import RequestManager, { bytesToHex, hexToBytes, sha3, stringToUtf8Bytes } from 'eth-connect'
import { SignatureValidator } from './contracts/SignatureValidator'
import {
  ethSign,
  recoverAddressFromEthSignature,
  createEthereumMessageHash as utilsCreateEthereumMessage
} from './crypto'
import Blocks from './helper/blocks'
import { moveMinutes } from './helper/utils'
import {
  SERVICE_FORMAT,
  ScopedAuthLinkType,
  findScopedLink,
  getScopedEphemeralMessage,
  parseScopedEphemeralPayload
} from './scoped-login'
import { AuthLinkType } from './types'
import type {
  AuthChain,
  AuthIdentity,
  AuthLink,
  EthAddress,
  IdentityType,
  ScopedLoginGrant,
  ScopedLoginValidationOptions,
  Signature,
  ValidationResult
} from './types'

export const VALID_SIGNATURE = 'VALID_SIGNATURE'
// bytes4(keccak256("isValidSignature(bytes32,bytes)")
export const ERC1654_MAGIC_VALUE = '1626ba7e'

const PERSONAL_SIGNATURE_LENGTH = 132

/**
 * Validate that the signature belongs to the Ethereum address.
 *
 * A chain with a scoped login link (ADR-162) is valid only when `options.service` is set and the
 * login grants something to that service; the result then carries those grants in `scope`.
 */
export async function validateSignature(
  expectedFinalAuthority: string,
  authChain: AuthChain,
  provider: unknown,
  dateToValidateExpirationInMillis: number = Date.now(),
  options: ScopedLoginValidationOptions = {}
): Promise<ValidationResult> {
  let currentAuthority = ''

  if (!isValidAuthChain(authChain)) {
    return {
      ok: false,
      message: 'ERROR: Malformed authChain'
    }
  }

  let scopedLinkIndex: number | undefined
  try {
    scopedLinkIndex = findScopedLink(authChain)
  } catch (e) {
    return { ok: false, message: `ERROR: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (scopedLinkIndex !== undefined && (options.service === undefined || !SERVICE_FORMAT.test(options.service))) {
    return { ok: false, message: 'ERROR: Scoped logins are not accepted without a service identifier' }
  }

  for (const authLink of authChain) {
    const validator: ValidatorType = getValidatorByType(authLink.type)
    try {
      const { nextAuthority } = await validator(currentAuthority, authLink, {
        provider,
        dateToValidateExpirationInMillis
      })
      currentAuthority = nextAuthority ? nextAuthority : ''
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return {
        ok: false,
        message: `ERROR. Link type: ${authLink.type}. ${message}.`
      }
    }
  }

  const ok = currentAuthority === expectedFinalAuthority

  if (!ok || scopedLinkIndex === undefined) {
    return {
      ok,
      message: ok
        ? undefined
        : `ERROR: Invalid final authority. Expected: ${expectedFinalAuthority}. Current ${currentAuthority}.`
    }
  }

  return scopeOf(authChain[scopedLinkIndex], dateToValidateExpirationInMillis, options)
}

/** The grants of an already validated scoped link for the verifier's service, or why it is refused. */
function scopeOf(
  authLink: AuthLink,
  dateToValidateExpirationInMillis: number,
  { service, maxScopedLoginLifetimeInMillis }: ScopedLoginValidationOptions
): ValidationResult {
  const { expiration, grants } = parseScopedEphemeralPayload(authLink.payload)
  const granted = grants.filter((grant) => grant.service === service)
  if (granted.length === 0) {
    return { ok: false, message: `ERROR: The scoped login grants nothing to "${service}"` }
  }
  if (maxScopedLoginLifetimeInMillis !== undefined) {
    // A misconfigured cap (NaN, Infinity, a negative number) rejects every scoped login.
    if (
      !(Number.isFinite(maxScopedLoginLifetimeInMillis) && maxScopedLoginLifetimeInMillis > 0) ||
      expiration - dateToValidateExpirationInMillis > maxScopedLoginLifetimeInMillis
    ) {
      return { ok: false, message: 'ERROR: The scoped login lasts longer than this verifier accepts' }
    }
  }
  return { ok: true, message: undefined, scope: { service: service as string, expiration, grants: granted } }
}

export function isValidAuthChain(authChain: AuthChain): boolean {
  for (const [index, authLink] of authChain.entries()) {
    // SIGNER should be the first one
    if (index === 0 && authLink.type !== AuthLinkType.SIGNER) {
      return false
    }

    // SIGNER should be unique
    if (authLink.type === AuthLinkType.SIGNER && index !== 0) {
      return false
    }
  }

  return true
}

// https://github.com/ethereum/EIPs/blob/master/EIPS/eip-1271.md
// Note: intentionally does NOT apply the "\x19Ethereum Signed Message:\n" prefix —
// EIP-1271 wallets verify against the raw keccak256 of the message bytes.
export function createEIP1271MessageHash(msg: string): Uint8Array {
  return hexToBytes(sha3(stringToUtf8Bytes(msg)))
}

export function createSimpleAuthChain(finalPayload: string, ownerAddress: EthAddress, signature: Signature): AuthChain {
  return [
    {
      type: AuthLinkType.SIGNER,
      payload: ownerAddress,
      signature: ''
    },
    {
      type: getSignedIdentitySignatureType(signature),
      payload: finalPayload,
      signature: signature
    }
  ]
}

export function createAuthChain(
  ownerIdentity: IdentityType,
  ephemeralIdentity: IdentityType,
  ephemeralMinutesDuration: number,
  entityId: string
): AuthChain {
  const expiration = moveMinutes(ephemeralMinutesDuration)

  const ephemeralMessage = getEphemeralMessage(ephemeralIdentity.address, expiration)
  const firstSignature = createSignature(ownerIdentity, ephemeralMessage)
  const secondSignature = createSignature(ephemeralIdentity, entityId)

  const authChain: AuthChain = [
    {
      type: AuthLinkType.SIGNER,
      payload: ownerIdentity.address,
      signature: ''
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_EPHEMERAL,
      payload: ephemeralMessage,
      signature: firstSignature
    },
    {
      type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
      payload: entityId,
      signature: secondSignature
    }
  ]

  return authChain
}

export async function initializeAuthChain(
  ethAddress: EthAddress,
  ephemeralIdentity: IdentityType,
  ephemeralMinutesDuration: number,
  signer: (message: string) => Promise<string>
): Promise<AuthIdentity> {
  const expiration = moveMinutes(ephemeralMinutesDuration)

  const ephemeralMessage = getEphemeralMessage(ephemeralIdentity.address, expiration)
  const firstSignature = await signer(ephemeralMessage)

  const authChain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: ethAddress, signature: '' },
    {
      type: getEphemeralSignatureType(firstSignature),
      payload: ephemeralMessage,
      signature: firstSignature
    }
  ]

  return {
    ephemeralIdentity,
    expiration,
    authChain
  }
}

/**
 * Like `initializeAuthChain`, but delegates only `grants` to the ephemeral key (ADR-162). Only
 * services that accept scoped logins and are named in `grants` accept the resulting identity; every
 * other verifier rejects it.
 *
 * @throws Error if a grant is malformed (see `getScopedEphemeralMessage`).
 */
export async function initializeScopedAuthChain(
  ethAddress: EthAddress,
  ephemeralIdentity: IdentityType,
  ephemeralMinutesDuration: number,
  grants: ScopedLoginGrant[],
  signer: (message: string) => Promise<string>
): Promise<AuthIdentity> {
  const expiration = moveMinutes(ephemeralMinutesDuration)

  const scopedMessage = getScopedEphemeralMessage(ephemeralIdentity.address, expiration, grants)
  const firstSignature = await signer(scopedMessage)

  const authChain: AuthChain = [
    { type: AuthLinkType.SIGNER, payload: ethAddress, signature: '' },
    {
      type: getScopedEphemeralSignatureType(firstSignature),
      payload: scopedMessage,
      signature: firstSignature
    }
  ]

  return {
    ephemeralIdentity,
    expiration,
    authChain
  }
}

export function signPayload(authIdentity: AuthIdentity, entityId: string): AuthChain {
  const secondSignature = createSignature(authIdentity.ephemeralIdentity, entityId)
  return [
    ...authIdentity.authChain,
    {
      type: AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY,
      payload: entityId,
      signature: secondSignature
    }
  ]
}

export const createEthereumMessageHash = utilsCreateEthereumMessage

export function createSignature(identity: IdentityType, message: string | Uint8Array): string {
  return ethSign(hexToBytes(identity.privateKey), message)
}

export function ownerAddress(authChain: AuthChain): EthAddress {
  if (authChain.length > 0) {
    if (authChain[0].type === AuthLinkType.SIGNER) {
      return authChain[0].payload
    }
  }
  return 'Invalid-Owner-Address'
}

export function getEphemeralMessage(ephemeralAddress: string, expiration: Date): string {
  return `Decentraland Login\nEphemeral address: ${ephemeralAddress}\nExpiration: ${expiration.toISOString()}`
}

export const Authenticator = {
  validateSignature,
  isValidAuthChain,
  createEIP1271MessageHash,
  createSimpleAuthChain,
  createAuthChain,
  initializeAuthChain,
  initializeScopedAuthChain,
  signPayload,
  createEthereumMessageHash,
  createSignature,
  ownerAddress,
  getEphemeralMessage,
  getScopedEphemeralMessage
} as const

type ValidatorType = (
  authority: string,
  authLink: AuthLink,
  options?: ValidationOptions
) => Promise<{ error?: string; nextAuthority?: string }>

interface ValidationOptions {
  dateToValidateExpirationInMillis: number
  provider?: unknown
}

export const SIGNER_VALIDATOR: ValidatorType = async (_: string, authLink: AuthLink) => {
  return { nextAuthority: authLink.payload }
}

export const ECDSA_SIGNED_ENTITY_VALIDATOR: ValidatorType = async (authority: string, authLink: AuthLink) => {
  if (!authLink.signature) {
    throw new Error(`Invalid AuthLink. 'signature' must be present for type 'ECDSA_SIGNED_ENTITY_VALIDATOR'`)
  }
  const signerAddress = recoverAddressFromEthSignature(authLink.signature, authLink.payload)
  const expectedSignedAddress = authority.toLocaleLowerCase()
  const actualSignedAddress = signerAddress.toLocaleLowerCase()

  if (expectedSignedAddress === actualSignedAddress) {
    return { nextAuthority: authLink.payload }
  }

  throw new Error(`Invalid signer address. Expected: ${expectedSignedAddress}. Actual: ${actualSignedAddress}`)
}

export const ECDSA_PERSONAL_EPHEMERAL_VALIDATOR: ValidatorType = async (
  authority: string,
  authLink: AuthLink,
  options?: ValidationOptions
) => {
  if (!authLink.signature) {
    throw new Error(`Invalid AuthLink. 'signature' must be present for type 'ECDSA_PERSONAL_EPHEMERAL_VALIDATOR'`)
  }
  const { message, ephemeralAddress, expiration } = parseEphemeralPayload(authLink.payload)

  const dateToValidateExpirationInMillis = options?.dateToValidateExpirationInMillis || Date.now()

  if (expiration > dateToValidateExpirationInMillis) {
    const signerAddress = recoverAddressFromEthSignature(authLink.signature, message)
    const expectedSignedAddress = authority.toLocaleLowerCase()
    const actualSignedAddress = signerAddress.toLocaleLowerCase()

    if (expectedSignedAddress === actualSignedAddress) {
      return { nextAuthority: ephemeralAddress }
    }

    throw new Error(`Invalid signer address. Expected: ${expectedSignedAddress}. Actual: ${actualSignedAddress}`)
  }

  throw new Error(`Ephemeral key expired. Expiration: ${expiration}. Test: ${dateToValidateExpirationInMillis}`)
}

export const ECDSA_EIP_1654_EPHEMERAL_VALIDATOR: ValidatorType = async (
  authority: string,
  authLink: AuthLink,
  options?: ValidationOptions
) => {
  if (!authLink.signature) {
    throw new Error(`Invalid AuthLink. 'signature' must be present for type 'ECDSA_EIP_1654_EPHEMERAL_VALIDATOR'`)
  }
  const { message, ephemeralAddress, expiration } = parseEphemeralPayload(authLink.payload)

  const dateToValidateExpirationInMillis = options?.dateToValidateExpirationInMillis || Date.now()
  if (expiration > dateToValidateExpirationInMillis) {
    if (
      await isValidEIP1654Message(
        options?.provider,
        authority,
        message,
        authLink.signature,
        dateToValidateExpirationInMillis
      )
    ) {
      return { nextAuthority: ephemeralAddress }
    }
  }

  throw new Error(`Ephemeral key expired. Expiration: ${expiration}. Test: ${dateToValidateExpirationInMillis}`)
}

export const EIP_1654_SIGNED_ENTITY_VALIDATOR: ValidatorType = async (
  authority: string,
  authLink: AuthLink,
  options?: ValidationOptions
) => {
  if (!authLink.signature) {
    throw new Error(`Invalid AuthLink. 'signature' must be present for type 'EIP_1654_SIGNED_ENTITY_VALIDATOR'`)
  }
  if (!options) {
    throw new Error(`Missing validation options for 'EIP_1654_SIGNED_ENTITY_VALIDATOR'`)
  }
  if (
    await isValidEIP1654Message(
      options.provider,
      authority,
      authLink.payload,
      authLink.signature,
      options.dateToValidateExpirationInMillis
    )
  ) {
    return { nextAuthority: authLink.payload }
  }

  throw new Error(`Invalid validation`)
}

export const ECDSA_SCOPED_EPHEMERAL_VALIDATOR: ValidatorType = async (
  authority: string,
  authLink: AuthLink,
  options?: ValidationOptions
) => {
  if (!authLink.signature) {
    throw new Error(`Invalid AuthLink. 'signature' must be present for type 'ECDSA_SCOPED_EPHEMERAL_VALIDATOR'`)
  }
  const { ephemeralAddress, expiration } = parseScopedEphemeralPayload(authLink.payload)

  const dateToValidateExpirationInMillis = options?.dateToValidateExpirationInMillis || Date.now()

  if (expiration > dateToValidateExpirationInMillis) {
    const signerAddress = recoverAddressFromEthSignature(authLink.signature, authLink.payload)
    const expectedSignedAddress = authority.toLocaleLowerCase()
    const actualSignedAddress = signerAddress.toLocaleLowerCase()

    if (expectedSignedAddress === actualSignedAddress) {
      return { nextAuthority: ephemeralAddress }
    }

    throw new Error(`Invalid signer address. Expected: ${expectedSignedAddress}. Actual: ${actualSignedAddress}`)
  }

  throw new Error(`Ephemeral key expired. Expiration: ${expiration}. Test: ${dateToValidateExpirationInMillis}`)
}

export const ECDSA_EIP_1654_SCOPED_EPHEMERAL_VALIDATOR: ValidatorType = async (
  authority: string,
  authLink: AuthLink,
  options?: ValidationOptions
) => {
  if (!authLink.signature) {
    throw new Error(
      `Invalid AuthLink. 'signature' must be present for type 'ECDSA_EIP_1654_SCOPED_EPHEMERAL_VALIDATOR'`
    )
  }
  const { ephemeralAddress, expiration } = parseScopedEphemeralPayload(authLink.payload)

  const dateToValidateExpirationInMillis = options?.dateToValidateExpirationInMillis || Date.now()
  if (expiration > dateToValidateExpirationInMillis) {
    if (
      await isValidEIP1654Message(
        options?.provider,
        authority,
        authLink.payload,
        authLink.signature,
        dateToValidateExpirationInMillis
      )
    ) {
      return { nextAuthority: ephemeralAddress }
    }
  }

  throw new Error(`Ephemeral key expired. Expiration: ${expiration}. Test: ${dateToValidateExpirationInMillis}`)
}

const ERROR_VALIDATOR: ValidatorType = async (_: string, __: AuthLink) => {
  return { error: 'Error Validator.' }
}

export function getEphemeralSignatureType(signature: string): AuthLinkType {
  if (signature.length === PERSONAL_SIGNATURE_LENGTH) {
    return AuthLinkType.ECDSA_PERSONAL_EPHEMERAL
  } else {
    return AuthLinkType.ECDSA_EIP_1654_EPHEMERAL
  }
}

/** The scoped link type matching a signature: a personal signature, or a contract wallet's. */
export function getScopedEphemeralSignatureType(signature: string): AuthLinkType {
  // The scoped types are not in @dcl/schemas' AuthLinkType yet (see ScopedAuthLinkType).
  return (signature.length === PERSONAL_SIGNATURE_LENGTH
    ? ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL
    : ScopedAuthLinkType.ECDSA_EIP_1654_SCOPED_EPHEMERAL) as unknown as AuthLinkType
}

export function getSignedIdentitySignatureType(signature: string): AuthLinkType {
  if (signature.length === PERSONAL_SIGNATURE_LENGTH) {
    return AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY
  } else {
    return AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY
  }
}

export function parseEphemeralPayload(payload: string): {
  message: string
  ephemeralAddress: string
  expiration: number
} {
  // authLink payload structure: <human-readable message>\nEphemeral address: <ephemeral-eth-address>\nExpiration: <timestamp>
  // authLink payload example: Decentraland Login\nEphemeral address: 0x123456\nExpiration: 2020-01-20T22:57:11.334Z
  const message = payload.replace(/\r/g, '')
  const payloadParts: string[] = message.split('\n')

  const ephemeralPrefix = 'Ephemeral address: '
  const expirationPrefix = 'Expiration: '

  if (
    payloadParts.length < 3 ||
    !payloadParts[1].startsWith(ephemeralPrefix) ||
    !payloadParts[2].startsWith(expirationPrefix)
  ) {
    throw new Error(
      `Invalid ephemeral payload. Expected 3 lines with "${ephemeralPrefix}" on line 2 and "${expirationPrefix}" on line 3.`
    )
  }

  const ephemeralAddress: string = payloadParts[1].substring(ephemeralPrefix.length)
  const expirationString: string = payloadParts[2].substring(expirationPrefix.length)

  const expiration = Date.parse(expirationString)
  if (Number.isNaN(expiration)) {
    throw new Error(`Invalid expiration date in ephemeral payload: "${expirationString}"`)
  }

  return { message, ephemeralAddress, expiration }
}

/** @deprecated Use `parseEphemeralPayload` instead. Kept for backwards compatibility with a historical typo in the export name. */
export const parseEmphemeralPayload = parseEphemeralPayload

export async function isValidEIP1271Signature(
  signatureValidator: SignatureValidator,
  message: string,
  signature: string,
  block?: number
): Promise<boolean> {
  const hashedMessage = createEIP1271MessageHash(message)
  const _signature = hexToBytes(signature)
  let result

  try {
    result = bytesToHex(await signatureValidator.isValidSignature(hashedMessage, _signature, block))
  } catch (e) {
    // Can revert if the signature is not valid
  }

  if (result === ERC1654_MAGIC_VALUE) {
    return true
  }

  const hashedMessageWithPrefix = utilsCreateEthereumMessage(message)
  try {
    result = bytesToHex(await signatureValidator.isValidSignature(hashedMessageWithPrefix, _signature, block))
  } catch (e) {
    // Can revert if the signature is not valid
  }

  return result === ERC1654_MAGIC_VALUE
}

async function isValidEIP1654Message(
  provider: unknown,
  contractAddress: string,
  message: string,
  signature: string,
  dateToValidateExpirationInMillis: number
): Promise<boolean> {
  if (!provider) {
    throw new Error('Missing provider')
  }
  const requestManager = new RequestManager(provider)
  const signatureValidator = await SignatureValidator(requestManager, contractAddress)

  let result = await isValidEIP1271Signature(signatureValidator, message, signature)

  if (result) {
    return true
  }

  // check based on the dateToValidateExpirationInMillis
  const dater = new Blocks(requestManager)
  try {
    const { block } = await dater.getDate(dateToValidateExpirationInMillis, false)

    result = await isValidEIP1271Signature(signatureValidator, message, signature, block)

    if (result) {
      return true
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid validation. Error: ${message}`)
  }

  throw new Error(`Invalid validation. Expected: ${ERC1654_MAGIC_VALUE}. Actual: ${result}`)
}

function getValidatorByType(type: AuthLinkType): ValidatorType {
  switch (type as string) {
    case AuthLinkType.SIGNER:
      return SIGNER_VALIDATOR
    case AuthLinkType.ECDSA_PERSONAL_EPHEMERAL:
      return ECDSA_PERSONAL_EPHEMERAL_VALIDATOR
    case AuthLinkType.ECDSA_PERSONAL_SIGNED_ENTITY:
      return ECDSA_SIGNED_ENTITY_VALIDATOR
    case AuthLinkType.ECDSA_EIP_1654_EPHEMERAL:
      return ECDSA_EIP_1654_EPHEMERAL_VALIDATOR
    case AuthLinkType.ECDSA_EIP_1654_SIGNED_ENTITY:
      return EIP_1654_SIGNED_ENTITY_VALIDATOR
    case ScopedAuthLinkType.ECDSA_PERSONAL_SCOPED_EPHEMERAL:
      return ECDSA_SCOPED_EPHEMERAL_VALIDATOR
    case ScopedAuthLinkType.ECDSA_EIP_1654_SCOPED_EPHEMERAL:
      return ECDSA_EIP_1654_SCOPED_EPHEMERAL_VALIDATOR
    default:
      return ERROR_VALIDATOR
  }
}
