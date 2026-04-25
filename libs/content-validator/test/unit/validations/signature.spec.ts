import { createSignatureValidateFn } from '../../../src/validations/signature'
import { buildDeployment } from '../../setup/deployments'
import { buildComponents, buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

describe('when validating the signature', () => {
  describe('and the signature cannot be validated', () => {
    const signatureFailureMessage = 'test'
    let result: ValidationResponse

    beforeEach(async () => {
      const deployment = buildDeployment()
      const externalCalls = buildExternalCalls({
        validateSignature: () => Promise.resolve({ ok: false, message: signatureFailureMessage })
      })
      const validateFn = createSignatureValidateFn(buildComponents({ externalCalls }))
      result = await validateFn(deployment)
    })

    it('should return an error containing the signature failure message', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`The signature is invalid. ${signatureFailureMessage}`)
    })
  })

  describe('and the signature is valid', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const deployment = buildDeployment()
      const externalCalls = buildExternalCalls({
        validateSignature: () => Promise.resolve({ ok: true })
      })
      const validateFn = createSignatureValidateFn(buildComponents({ externalCalls }))
      result = await validateFn(deployment)
    })

    it('should return ok with no errors', () => {
      expect(result.ok).toBe(true)
    })
  })
})
