import { buildSubgraphAccessCheckerComponents } from './mock'
import { createOutfitsValidateFn } from '../../../src/validations/access/subgraph/outfits'
import { buildOutfitsDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

// The outfits access layer must authorize the pointer against the signer, not only wearable/name
// ownership, mirroring profile/store.
describe('when validating outfits subgraph access', () => {
  const signer = '0x2222222222222222222222222222222222222222'

  describe('and the outfits pointer belongs to a different address than the signer', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const externalCalls = buildExternalCalls({ ownerAddress: () => signer })
      const components = buildSubgraphAccessCheckerComponents({ externalCalls })
      const deployment = buildOutfitsDeployment(['0x1111111111111111111111111111111111111111:outfits'])
      const validateFn = createOutfitsValidateFn(components)
      response = await validateFn(deployment)
    })

    it('should reject the deployment because the signer does not own the outfits pointer', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContainEqual(expect.stringContaining('You can only alter your own outfits'))
    })
  })
})
