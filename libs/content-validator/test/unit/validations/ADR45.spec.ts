import type { Entity } from '@dcl/schemas'
import { adr45ValidateFn } from '../../../src/validations/ADR45'
import { ADR_45_TIMESTAMP } from '../../../src/validations/timestamps'
import { buildDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import type { ValidationResponse } from '../../../src/types'

describe('when validating ADR-45 entity version constraint', () => {
  describe('and the entity version is v3 after ADR-45', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ version: 'v3', timestamp: ADR_45_TIMESTAMP + 1000 })
      result = await adr45ValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the entity version is not v3 after ADR-45', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ version: 'v2' as Entity['version'], timestamp: ADR_45_TIMESTAMP + 1000 })
      result = await adr45ValidateFn(buildDeployment({ entity }))
    })

    it('should return an error referencing ADR-45', () => {
      expect(result.ok).toBe(false)
      expect(result.errors).toContain(
        'Only entities v3 are allowed after the ADR-45. Check http://adr.decentraland.org/adr/ADR-45 for more information'
      )
    })
  })

  describe('and the entity version is not v3 at the exact ADR-45 timestamp', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ version: 'v2' as Entity['version'], timestamp: ADR_45_TIMESTAMP })
      result = await adr45ValidateFn(buildDeployment({ entity }))
    })

    it('should return ok because the ADR-45 strict timestamp check uses greater-than', () => {
      expect(result.ok).toBe(true)
    })
  })

  describe('and the entity version is not v3 before ADR-45', () => {
    let result: ValidationResponse

    beforeEach(async () => {
      const entity = buildEntity({ version: 'v2' as Entity['version'], timestamp: ADR_45_TIMESTAMP - 1000 })
      result = await adr45ValidateFn(buildDeployment({ entity }))
    })

    it('should return ok', () => {
      expect(result.ok).toBe(true)
    })
  })
})
