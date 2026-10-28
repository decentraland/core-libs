// Preserve the existing deep-import API without exposing identity-only verification.
export {
  default,
  isEIP1654AuthChain,
  extractAuthChain,
  verifyPersonalSign,
  verifyEIP1654Sign,
  verifySign,
  verifyTimestamp,
  verifyMetadata,
  verifyExpiration,
  createPayload,
  createLegacyPayload,
  assertLegacyMetadataKeys
} from './internal-verification'
