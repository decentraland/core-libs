import {
  buildSubgraphAccessCheckerComponents,
  buildWearableValidateFn,
  fetcherWithThirdPartyEmptyMerkleRoots,
  fetcherWithThirdPartyMerkleRoot,
  fetcherWithValidCollectionAndCreator,
  fetcherWithoutAccess
} from './mock'
import { buildThirdPartyWearableDeployment, buildWearableDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import { VALID_THIRD_PARTY_WEARABLE, VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS } from '../../setup/wearable'
import type { ValidationResponse } from '../../../src/types'

describe('when validating wearable subgraph access', () => {
  describe('and the pointers are not URNs', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildWearableDeployment(['invalid-pointer'])
      const externalCalls = buildExternalCalls()
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
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
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return an error stating only one pointer is allowed', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(`Only one pointer is allowed when you create an item. Received: ${pointers}`)
    })
  })

  describe('and several pointers resolve to the same v1 URN with no access', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const pointers = [
        'urn:decentraland:ethereum:collections-v1:atari_launch:atari_red_upper_body',
        'urn:decentraland:ethereum:collections-v1:0x4c290f486bae507719c562b6b524bdb71a2570c9:atari_red_upper_body'
      ]
      const deployment = buildWearableDeployment(pointers)
      const externalCalls = buildExternalCalls({ ownerAddress: () => 'some address' })
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
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
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
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
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
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
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
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
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
      const validateFn = buildWearableValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should return ok for a Decentraland address', () => {
      expect(response.ok).toBe(true)
    })
  })

  describe('and the urn network belongs to L2', () => {
    let subGraphs: ReturnType<typeof fetcherWithValidCollectionAndCreator>

    beforeEach(async () => {
      const ethAddress = 'address'
      subGraphs = fetcherWithValidCollectionAndCreator(ethAddress)
      const externalCalls = buildExternalCalls({ ownerAddress: () => ethAddress })
      const deployment = buildWearableDeployment([
        'urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'
      ])
      const components = buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs })
      const validateFn = buildWearableValidateFn(components)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the L2 blocks subgraph and the L2 collections subgraph', () => {
      expect(subGraphs.L2.blocks.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      expect(subGraphs.L2.collections.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
    })
  })

  describe('and the urn network belongs to L1', () => {
    let subGraphs: ReturnType<typeof fetcherWithoutAccess>

    beforeEach(async () => {
      const ethAddress = 'address'
      subGraphs = fetcherWithoutAccess()
      const externalCalls = buildExternalCalls({ ownerAddress: () => ethAddress })
      const deployment = buildWearableDeployment([
        'urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'
      ])
      const components = buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs })
      const validateFn = buildWearableValidateFn(components)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the L1 blocks subgraph and the L1 collections subgraph', () => {
      expect(subGraphs.L1.blocks.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      expect(subGraphs.L1.collections.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
    })
  })

  describe('and the urn network belongs to L2 but the address has no access', () => {
    let subGraphs: ReturnType<typeof fetcherWithoutAccess>

    beforeEach(async () => {
      const ethAddress = 'address'
      subGraphs = fetcherWithoutAccess()
      const externalCalls = buildExternalCalls({ ownerAddress: () => ethAddress })
      const deployment = buildWearableDeployment([
        'urn:decentraland:mumbai:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'
      ])
      const components = buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs })
      const validateFn = buildWearableValidateFn(components)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the L2 collections subgraph twice', () => {
      expect(subGraphs.L2.blocks.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      expect(subGraphs.L2.collections.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      expect(subGraphs.L2.collections.query).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything())
    })
  })

  describe('and the urn network belongs to L1 but the address has no access', () => {
    let subGraphs: ReturnType<typeof fetcherWithoutAccess>

    beforeEach(async () => {
      const ethAddress = 'address'
      subGraphs = fetcherWithoutAccess()
      const externalCalls = buildExternalCalls({ ownerAddress: () => ethAddress })
      const deployment = buildWearableDeployment([
        'urn:decentraland:ethereum:collections-v2:0x8dec2b9bd86108430a0c288ea1b76c749823d104:1'
      ])
      const components = buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs })
      const validateFn = buildWearableValidateFn(components)
      await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the L1 collections subgraph twice', () => {
      expect(subGraphs.L1.blocks.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      expect(subGraphs.L1.collections.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      expect(subGraphs.L1.collections.query).toHaveBeenNthCalledWith(2, expect.anything(), expect.anything())
    })
  })

  describeMerkleProofTests(
    'and the deployment is a Merkle Proofed (Third Party) wearable',
    VALID_THIRD_PARTY_WEARABLE,
    {
      proof: [],
      index: 0,
      hashingKeys: [],
      entityHash: ''
    }
  )

  describeMerkleProofTests(
    'and the deployment is a Merkle Proofed (Linked) wearable',
    VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS,
    { proof: '', index: 0, hashingKeys: [], entityHash: '' } as unknown
  )
})

function describeMerkleProofTests(
  label: string,
  fixture: typeof VALID_THIRD_PARTY_WEARABLE | typeof VALID_THIRD_PARTY_WEARABLE_WITH_MAPPINGS,
  malformedMerkleProof: unknown
): void {
  const metadata = fixture.entity
  const { root: merkleRoot } = fixture

  const runValidation = async (overrides?: Record<string, unknown>): Promise<ValidationResponse> => {
    const subGraphs = fetcherWithThirdPartyMerkleRoot(merkleRoot)
    const deployment = buildThirdPartyWearableDeployment(metadata.id, { ...metadata, ...overrides })
    const components = buildSubgraphAccessCheckerComponents({ subGraphs })
    return buildWearableValidateFn(components)(deployment)
  }

  describe(label, () => {
    describe('and the merkle root verifies against the proofs', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        response = await runValidation()
      })

      it('should return ok', () => {
        expect(response.ok).toBe(true)
      })
    })

    describe('and the metadata is modified', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        response = await runValidation({ content: {} })
      })

      it('should reject the deployment', () => {
        expect(response.ok).toBe(false)
      })
    })

    describe('and the proofs verification queries the L2 subgraph', () => {
      let subGraphs: ReturnType<typeof fetcherWithThirdPartyMerkleRoot>

      beforeEach(async () => {
        subGraphs = fetcherWithThirdPartyMerkleRoot(merkleRoot)
        const deployment = buildThirdPartyWearableDeployment(metadata.id, metadata)
        const components = buildSubgraphAccessCheckerComponents({ subGraphs })
        await buildWearableValidateFn(components)(deployment)
      })

      afterEach(() => {
        jest.resetAllMocks()
      })

      it('should query the L2 blocks subgraph and the L2 third-party registry', () => {
        expect(subGraphs.L2.blocks.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
        expect(subGraphs.L2.thirdPartyRegistry.query).toHaveBeenNthCalledWith(1, expect.anything(), expect.anything())
      })
    })

    describe('and no merkle proof is found in the subgraph', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        const subGraphs = fetcherWithThirdPartyEmptyMerkleRoots()
        const deployment = buildThirdPartyWearableDeployment(metadata.id, metadata)
        const components = buildSubgraphAccessCheckerComponents({ subGraphs })
        response = await buildWearableValidateFn(components)(deployment)
      })

      it('should reject the deployment', () => {
        expect(response.ok).toBe(false)
      })
    })

    describe('and the merkle proof is malformed', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        response = await runValidation({ merkleProof: malformedMerkleProof })
      })

      it('should reject the deployment', () => {
        expect(response.ok).toBe(false)
      })
    })

    describe('and requiredKeys are not a subset of the hashingKeys', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        response = await runValidation({
          merkleProof: { ...metadata.merkleProof, hashingKeys: ['id', 'description'] }
        })
      })

      it('should reject the deployment', () => {
        expect(response.ok).toBe(false)
      })
    })

    describe('and the entityHash does not match the calculated hash', () => {
      let response: ValidationResponse

      beforeEach(async () => {
        response = await runValidation({
          merkleProof: { ...metadata.merkleProof, entityHash: 'someInvalidHash' }
        })
      })

      it('should reject the deployment', () => {
        expect(response.ok).toBe(false)
      })
    })
  })
}
