import { buildOnChainAccessCheckerComponents } from './mock'
import { createSceneValidateFn } from '../../../src/validations/access/on-chain/scenes'
import { buildSceneDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

describe('when validating scene on-chain access', () => {
  describe('and a non-Decentraland address tries to deploy a default scene', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['Default10'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => false,
        ownerAddress: () => '0xAddress'
      })
      const validateFn = createSceneValidateFn(buildOnChainAccessCheckerComponents({ externalCalls }))
      response = await validateFn(deployment)
    })

    it('should return an error reporting the invalid scene pointer format', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        'Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: default10'
      )
    })
  })

  describe('and a Decentraland address tries to deploy a default scene', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['Default10'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => '0xAddress'
      })
      const validateFn = createSceneValidateFn(buildOnChainAccessCheckerComponents({ externalCalls }))
      response = await validateFn(deployment)
    })

    it('should reject the deployment because default scenes cannot be deployed', () => {
      expect(response.ok).toBe(false)
    })
  })

  describe('and the pointers contain non-numeric coordinates', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['abc,def'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => false,
        ownerAddress: () => '0xAddress'
      })
      const validateFn = createSceneValidateFn(buildOnChainAccessCheckerComponents({ externalCalls }))
      response = await validateFn(deployment)
    })

    it('should return an error reporting the invalid pointer format', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        'Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: abc,def'
      )
    })
  })

  describe('and the pointers are not URNs', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['invalid-pointer'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => '0xAddress'
      })
      const validateFn = createSceneValidateFn(buildOnChainAccessCheckerComponents({ externalCalls }))
      response = await validateFn(deployment)
    })

    it('should return an error reporting the invalid pointer format', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        'Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: invalid-pointer'
      )
    })
  })

  describe('and a pointer mixes digits with non-numeric characters', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['10abc,20'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => false,
        ownerAddress: () => '0xAddress'
      })
      const validateFn = createSceneValidateFn(buildOnChainAccessCheckerComponents({ externalCalls }))
      response = await validateFn(deployment)
    })

    it('should reject the malformed pointer instead of normalizing it to (10,20)', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        'Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: 10abc,20'
      )
    })
  })
})
