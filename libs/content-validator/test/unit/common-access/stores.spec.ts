import type { Entity } from '@dcl/schemas'
import { EntityType } from '@dcl/schemas'
import { createStoreValidateFn } from '../../../src/validations/access/common/stores'
import { buildDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

const SAMPLE_ENTITY_ID = 'bafybeihz4c4cf4icnlh6yjtt7fooaeih3dkv2mz6umod7dybenzmsxkzvq'
const OWNER_ADDRESS = '0x12e7f74e73e951c61edd80910e46c3fece512345'

const buildStoreEntity = (pointers: string[]): Entity => ({
  version: 'v3',
  type: EntityType.STORE,
  pointers,
  timestamp: Date.now(),
  content: [],
  id: SAMPLE_ENTITY_ID,
  metadata: {}
})

describe('when validating store access', () => {
  describe('and the deployment has more than one pointer', () => {
    let result: ValidationResponse
    const pointers = [
      'urn:decentraland:off-chain:marketplace-stores:0x12e7f74e73e951c61edd80910e46c3fece512345',
      'urn:decentraland:off-chain:marketplace-stores:0x862f109696d7121438642a78b3caa38f476db08b'
    ]

    beforeEach(async () => {
      const entity = buildStoreEntity(pointers)
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => OWNER_ADDRESS })
      const validateFn = createStoreValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error stating only one pointer is allowed', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`Only one pointer is allowed when you create a Store. Received: ${pointers}`)
    })
  })

  describe('and the pointer is not a parseable off-chain URN', () => {
    let result: ValidationResponse
    const pointer = 'not-a-valid-urn'

    beforeEach(async () => {
      const entity = buildStoreEntity([pointer])
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => OWNER_ADDRESS })
      const validateFn = createStoreValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error reporting the invalid URN format', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `Store pointers should be a urn, for example (urn:decentraland:off-chain:marketplace-stores:{address}). Invalid pointer: ${pointer}`
      )
    })
  })

  describe('and the pointer URN does not match the signer address', () => {
    let result: ValidationResponse
    const pointerAddress = '0x862f109696d7121438642a78b3caa38f476db08b'

    beforeEach(async () => {
      const entity = buildStoreEntity([`urn:decentraland:off-chain:marketplace-stores:${pointerAddress}`])
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => OWNER_ADDRESS })
      const validateFn = createStoreValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return an error stating the pointer and signer addresses differ', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        `You can only alter your own store. The pointer address and the signer address are different (address:${pointerAddress.toLowerCase()} signer: ${OWNER_ADDRESS.toLowerCase()}).`
      )
    })
  })

  describe('and the pointer URN matches the signer address', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildStoreEntity([`urn:decentraland:off-chain:marketplace-stores:${OWNER_ADDRESS}`])
      const deployment = buildDeployment({ entity })
      const externalCalls = buildExternalCalls({ ownerAddress: () => OWNER_ADDRESS })
      const validateFn = createStoreValidateFn({ externalCalls })
      result = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})
