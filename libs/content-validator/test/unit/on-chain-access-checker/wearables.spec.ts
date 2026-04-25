import { buildOnChainAccessCheckerComponents, buildWearableValidateFn } from './mock'
import { buildThirdPartyWearableDeployment, buildWearableDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import { VALID_THIRD_PARTY_WEARABLE, VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS } from '../../setup/wearable'
import type { ValidationResponse } from '../../../src/types'

describe('when validating wearable on-chain access', () => {
  describe('and the pointers are not URNs', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildWearableDeployment(['invalid-pointer'])
      const externalCalls = buildExternalCalls()
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
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
      const deployment = buildWearableDeployment(pointers)
      const externalCalls = buildExternalCalls()
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an error stating only one pointer is allowed', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(`Only one pointer is allowed when you create an item. Received: ${pointers}`)
    })
  })

  describe('and several pointers resolve to the same v1 URN but the address has no access', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const pointers = [
        'urn:decentraland:ethereum:collections-v1:atari_launch:atari_red_upper_body',
        'urn:decentraland:ethereum:collections-v1:0x4c290f486bae507719c562b6b524bdb71a2570c9:atari_red_upper_body'
      ]
      const deployment = buildWearableDeployment(pointers)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an access-denied error for the resolved URN', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        `The provided Eth Address 'some address' does not have access to the following item: 'urn:decentraland:ethereum:collections-v1:atari_launch:atari_red_upper_body'`
      )
    })
  })

  describe('and several pointers resolve to the same v1 URN by alias', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const pointers = [
        'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body',
        'urn:decentraland:ethereum:collections-v1:0x574f64ac2e7215cba9752b85fc73030f35166bc0:dgtble_hoodi_linetang_upper_body'
      ]
      const deployment = buildWearableDeployment(pointers)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an access-denied error for the resolved URN', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        `The provided Eth Address 'some address' does not have access to the following item: 'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'`
      )
    })
  })

  describe('and the pointer resolves to an L1 collection-v1 asset for an unauthorized address', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildWearableDeployment([
        'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'
      ])
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an access-denied error for the resolved URN', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        `The provided Eth Address 'some address' does not have access to the following item: 'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'`
      )
    })
  })

  describe('and the pointer resolves to an L1 collection-v1 asset for a Decentraland address', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildWearableDeployment([
        'urn:decentraland:ethereum:collections-v1:dgtble_headspace:dgtble_hoodi_linetang_upper_body'
      ])
      const externalCalls = buildExternalCalls({ isAddressOwnedByDecentraland: () => true })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return ok', () => {
      expect(response.ok).toBe(true)
    })
  })

  describe('and the pointer resolves to a base avatar', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildWearableDeployment(['urn:decentraland:off-chain:base-avatars:BaseFemale'])
      const externalCalls = buildExternalCalls({ isAddressOwnedByDecentraland: () => true })
      const components = buildOnChainAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return ok for a Decentraland address', () => {
      expect(response.ok).toBe(true)
    })
  })

  describe('and the urn network belongs to L2', () => {
    const ethAddress = 'address'
    let components: ReturnType<typeof buildOnChainAccessCheckerComponents>
    let l2BlockSearchSpy: jest.SpyInstance

    beforeEach(async () => {
      const externalCalls = buildExternalCalls({ ownerAddress: () => ethAddress })
      components = buildOnChainAccessCheckerComponents({ externalCalls })
      const deployment = buildWearableDeployment([
        'urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'
      ])
      l2BlockSearchSpy = jest.spyOn(components.L2.blockSearch, 'findBlockForTimestamp')
      const validateFn = buildWearableValidateFn(components)
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

  describeMerkleProofTests('and the deployment is a Merkle Proofed (Third Party) wearable', VALID_THIRD_PARTY_WEARABLE)

  describeMerkleProofTests(
    'and the deployment is a Merkle Proofed (Linked) wearable',
    VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS,
    () => {
      const metadata = VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS.entity

      describe('and the L2 checker contract rejects the validation call', () => {
        let response: ValidationResponse
        let components: ReturnType<typeof buildOnChainAccessCheckerComponents>

        beforeEach(async () => {
          components = buildOnChainAccessCheckerComponents()
          components.L2.checker.validateThirdParty = jest.fn(() => Promise.reject('error'))
          const deployment = buildThirdPartyWearableDeployment(metadata.id, metadata)
          response = await buildWearableValidateFn(components)(deployment)
        })

        afterEach(() => {
          jest.resetAllMocks()
        })

        it('should reject the deployment after retrying with the next block', () => {
          expect(response.ok).toBe(false)
          expect(components.L2.checker.validateThirdParty).toHaveBeenNthCalledWith(
            1,
            expect.anything(),
            expect.anything(),
            10
          )
          expect(components.L2.checker.validateThirdParty).toHaveBeenNthCalledWith(
            2,
            expect.anything(),
            expect.anything(),
            11
          )
        })
      })
    }
  )
})

function describeMerkleProofTests(
  label: string,
  fixture: typeof VALID_THIRD_PARTY_WEARABLE | typeof VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS,
  extraDescribes?: () => void
): void {
  const metadata = fixture.entity

  describe(label, () => {
    describe('and the merkle root verifies against the proofs', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        const components = buildOnChainAccessCheckerComponents()
        components.L2.checker.validateThirdParty = jest.fn(() => Promise.resolve(true))
        const deployment = buildThirdPartyWearableDeployment(metadata.id, metadata)
        response = await buildWearableValidateFn(components)(deployment)
      })

      it('should return ok', () => {
        expect(response.ok).toBe(true)
      })
    })

    describe('and the metadata is modified', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        const components = buildOnChainAccessCheckerComponents()
        const deployment = buildThirdPartyWearableDeployment(metadata.id, { ...metadata, content: {} })
        response = await buildWearableValidateFn(components)(deployment)
      })

      it('should reject the deployment', () => {
        expect(response.ok).toBe(false)
      })
    })

    describe('and the proofs verification calls the L2 checker', () => {
      let components: ReturnType<typeof buildOnChainAccessCheckerComponents>
      let l2BlockSearchSpy: jest.SpyInstance

      beforeEach(async () => {
        components = buildOnChainAccessCheckerComponents()
        const deployment = buildThirdPartyWearableDeployment(metadata.id, metadata)
        l2BlockSearchSpy = jest.spyOn(components.L2.blockSearch, 'findBlockForTimestamp')
        await buildWearableValidateFn(components)(deployment)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should query the L2 block search and call the third-party checker', () => {
        expect(l2BlockSearchSpy).toHaveBeenNthCalledWith(1, expect.anything())
        expect(components.L2.checker.validateThirdParty).toHaveBeenNthCalledWith(
          2,
          expect.anything(),
          expect.anything(),
          expect.anything()
        )
      })
    })

    extraDescribes?.()
  })
}
