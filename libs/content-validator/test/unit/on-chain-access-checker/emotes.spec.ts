import { buildEmoteValidateFn, buildOnChainAccessCheckerComponents } from './mock'
import { buildEmoteDeployment, buildThirdPartyEmoteDeployment } from '../../setup/deployments'
import { VALID_THIRD_PARTY_EMOTE_METADATA_WITH_MERKLE_ROOT } from '../../setup/emotes'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

describe('when validating emote on-chain access', () => {
  describe('and the pointers are not URNs', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildEmoteDeployment(['invalid-pointer'])
      const externalCalls = buildExternalCalls()
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an error reporting the invalid URN pointer', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        'Item pointers should be a urn, for example (urn:decentraland:{protocol}:collections-v2:{contract(0x[a-fA-F0-9]+)}:{id}). Invalid pointer: (invalid-pointer)'
      )
    })
  })

  describe('and there is more than one pointer set', () => {
    const pointers = [
      'urn:decentraland:ethereum:collections-v1:atari_launch:a',
      'urn:decentraland:ethereum:collections-v1:atari_launch:b'
    ]
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildEmoteDeployment(pointers)
      const externalCalls = buildExternalCalls()
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an error stating only one pointer is allowed', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(`Only one pointer is allowed when you create an item. Received: ${pointers}`)
    })
  })

  describe('and several pointers resolve to the same v2 URN but the address has no access', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const pointers = [
        'urn:decentraland:ethereum:collections-v2:0x4c290f486bae507719c562b6b524bdb71a2570c9:1',
        'urn:decentraland:ethereum:collections-v2:0x4c290f486bae507719c562b6b524bdb71a2570c9:1'
      ]
      const deployment = buildEmoteDeployment(pointers)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an access-denied error for the resolved URN', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        `The provided Eth Address 'some address' does not have access to the following item: 'urn:decentraland:ethereum:collections-v2:0x4c290f486bae507719c562b6b524bdb71a2570c9:1'`
      )
    })
  })

  describe('and several pointers resolve to the same v2 URN with duplicates', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const pointers = [
        'urn:decentraland:ethereum:collections-v2:0x4c290f486bae507719c562b6b524bdb71a2570c9:1',
        'urn:decentraland:ethereum:collections-v2:0x4c290f486bae507719c562b6b524bdb71a2570c9:1'
      ]
      const deployment = buildEmoteDeployment(pointers)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an access-denied error for the resolved URN', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        `The provided Eth Address 'some address' does not have access to the following item: 'urn:decentraland:ethereum:collections-v2:0x4c290f486bae507719c562b6b524bdb71a2570c9:1'`
      )
    })
  })

  describe('and the urn network belongs to L2', () => {
    const ethAddress = 'address'
    let components: ReturnType<typeof buildOnChainAccessCheckerComponents>
    let l2BlockSearchSpy: jest.SpyInstance

    beforeEach(async () => {
      const externalCalls = buildExternalCalls({ ownerAddress: () => ethAddress })
      components = buildOnChainAccessCheckerComponents({ externalCalls })
      l2BlockSearchSpy = jest.spyOn(components.L2.blockSearch, 'findBlockForTimestamp')
      const deployment = buildEmoteDeployment([
        'urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'
      ])
      const validateFn = buildEmoteValidateFn(components)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should resolve the L2 block and call the L2 checker for the address with the resolved arguments', () => {
      expect(l2BlockSearchSpy).toHaveBeenNthCalledWith(1, expect.anything())
      expect(components.L2.checker.validateWearables).toHaveBeenNthCalledWith(
        1,
        ethAddress,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
      expect(components.L2.checker.validateWearables).toHaveBeenNthCalledWith(
        2,
        ethAddress,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything()
      )
    })
  })

  describe('and the pointer resolves to an L1 collection-v1 asset', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const pointers = ['urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body']
      const deployment = buildEmoteDeployment(pointers)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildEmoteValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an error stating collection-v1 assets are not valid for emotes', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        `For the entity type: emote, the asset with urn type: blockchain-collection-v1-asset is invalid. Valid urn types for this entity: off-chain,blockchain-collection-v2-asset,blockchain-collection-third-party`
      )
    })
  })

  describe('and the deployment is a Merkle Proofed (Third Party) emote', () => {
    const { entity: metadata } = VALID_THIRD_PARTY_EMOTE_METADATA_WITH_MERKLE_ROOT

    describe('and the merkle root verifies against the proofs', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        const components = buildOnChainAccessCheckerComponents()
        components.L2.checker.validateThirdParty = jest.fn(() => Promise.resolve(true))
        const deployment = buildThirdPartyEmoteDeployment(metadata.id, metadata)
        const validateFn = buildEmoteValidateFn(components)
        response = await validateFn(deployment)
      })

      it('should return ok', () => {
        expect(response.ok).toBe(true)
      })
    })

    describe('and the metadata is tampered while reusing a valid merkle proof', () => {
      let response: ValidationResponse
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

      beforeEach(async () => {
        components = buildOnChainAccessCheckerComponents()
        components.L2.checker.validateThirdParty = jest.fn(() => Promise.resolve(true))
        const modifiedMetadata = { ...metadata, name: 'tampered name that changes the entity hash' }
        const deployment = buildThirdPartyEmoteDeployment(modifiedMetadata.id, modifiedMetadata)
        const validateFn = buildEmoteValidateFn(components)
        response = await validateFn(deployment)
      })

      it('should reject before reaching the on-chain root check', () => {
        expect(response.ok).toBe(false)
        expect(components.L2.checker.validateThirdParty).not.toHaveBeenCalled()
      })
    })
  })
})
