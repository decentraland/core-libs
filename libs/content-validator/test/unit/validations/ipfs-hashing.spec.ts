import { hashV1 } from '@dcl/hashing'
import { ipfsHashingValidateFn } from '../../../src/validations/ipfs-hashing'
import { ADR_45_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import type { DeploymentToValidate, ValidationResponse } from '../../../src/types'

describe('when validating IPFS hashing', () => {
  const timestampAfterADR45 = ADR_45_TIMESTAMP + 1
  const nonIpfsHash = 'QmTBPcZLFQf1rZpZg2T8nMDwWRoqeftRdvkaexgAECaqHp'

  describe('and the entity timestamp is before ADR-45', () => {
    let deployment: DeploymentToValidate
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        content: [{ file: 'someFile', hash: nonIpfsHash }],
        timestamp: ADR_45_TIMESTAMP - 1
      })
      deployment = buildDeployment({ entity })
      result = await ipfsHashingValidateFn(deployment)
    })

    it('should skip validation and return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the entity id is not an IPFS v2 hash', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ id: nonIpfsHash, timestamp: timestampAfterADR45 })
      const deployment = buildDeployment({ entity })
      result = await ipfsHashingValidateFn(deployment)
    })

    it('should return an error reporting the invalid entity id', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`This hash '${nonIpfsHash}' is not valid. It should be IPFS v2 format.`)
    })
  })

  describe('and a content hash is not an IPFS v2 hash', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({
        content: [{ file: 'someFile', hash: nonIpfsHash }],
        timestamp: timestampAfterADR45
      })
      const deployment = buildDeployment({ entity })
      result = await ipfsHashingValidateFn(deployment)
    })

    it('should return an error reporting the invalid content hash', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(`This hash '${nonIpfsHash}' is not valid. It should be IPFS v2 format.`)
    })
  })

  describe('and all hashes are valid IPFS v2 hashes', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const ipfsHash = await hashV1(Buffer.from('some file'))
      const entity = buildEntity({
        content: [{ file: 'someFile.png', hash: ipfsHash }],
        timestamp: timestampAfterADR45
      })
      const deployment = buildDeployment({ entity })
      result = await ipfsHashingValidateFn(deployment)
    })

    it('should return ok with no errors', () => {
      expect(result.ok).toBe(true)
    })
  })
})
