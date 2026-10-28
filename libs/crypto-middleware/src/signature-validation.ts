// Preserve the existing deep-import API without exposing scoped identity-only validation.
export {
  MAX_AUTH_CHAIN_LENGTH,
  SignatureValidationInfrastructureError,
  validateAuthChainSignature
} from './internal-signature-validation'
export type { SignatureValidationOptions } from './internal-signature-validation'
