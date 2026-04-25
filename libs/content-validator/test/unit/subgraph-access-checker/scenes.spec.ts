import { buildSubGraphs, buildSubgraphAccessCheckerComponents } from './mock'
import { createSceneValidateFn } from '../../../src/validations/access/subgraph/scenes'
import { buildSceneDeployment } from '../../setup/deployments'
import { buildExternalCalls } from '../../setup/mock'
import type { ValidationResponse } from '../../../src/types'

const generateGetParcelResponseFromPointers = (pointers: number[][], address: string) => ({
  parcels: pointers.map((pointer) => ({
    owners: [{ address }],
    operators: [],
    updateOperators: [],
    x: pointer[0],
    y: pointer[1]
  }))
})

describe('when validating scene subgraph access', () => {
  describe('and a non-Decentraland address tries to deploy a default scene', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['Default10'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => false,
        ownerAddress: () => '0xAddress'
      })
      const validateFn = createSceneValidateFn(buildSubgraphAccessCheckerComponents({ externalCalls }))
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
      const validateFn = createSceneValidateFn(buildSubgraphAccessCheckerComponents({ externalCalls }))
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
      const validateFn = createSceneValidateFn(buildSubgraphAccessCheckerComponents({ externalCalls }))
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
      const validateFn = createSceneValidateFn(buildSubgraphAccessCheckerComponents({ externalCalls }))
      response = await validateFn(deployment)
    })

    it('should return an error reporting the invalid pointer format', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain(
        'Scene pointers should only contain two integers separated by a comma, for example (10,10) or (120,-45). Invalid pointer: invalid-pointer'
      )
    })
  })

  describe('and the deployment has valid pointers and the signer owns the parcel', () => {
    let response: ValidationResponse
    let subgraphsMocks: ReturnType<typeof buildSubGraphs>

    beforeEach(async () => {
      const deployment = buildSceneDeployment(['0,1'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => '0xAddress'
      })
      subgraphsMocks = buildSubGraphs({
        L1: {
          blocks: { query: jest.fn() },
          ensOwner: { query: jest.fn() },
          collections: { query: jest.fn() },
          landManager: {
            query: jest.fn().mockResolvedValue(
              generateGetParcelResponseFromPointers(
                [
                  [0, 1],
                  [2, 3],
                  [4, 5],
                  [5, 6]
                ],
                '0xAddress'
              )
            )
          }
        }
      })
      const validateFn = createSceneValidateFn(
        buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs: subgraphsMocks })
      )
      response = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should query the land manager and return ok with no errors', () => {
      expect(subgraphsMocks.L1.landManager.query).toHaveBeenCalledTimes(1)
      expect(response.ok).toBe(true)
      expect(response.errors).toBeUndefined()
    })
  })

  describe('and a pointer fails validation with concurrency=1', () => {
    let response: ValidationResponse
    let subgraphsMocks: ReturnType<typeof buildSubGraphs>

    beforeEach(async () => {
      process.env.SCENE_VALIDATIONS_CONCURRENCY = '1'
      const deployment = buildSceneDeployment(['0,1', '9,9', '2,3', '4,5', '5,6'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => '0xAddress'
      })
      const queryMock = jest.fn()
      subgraphsMocks = buildSubGraphs({
        L1: {
          blocks: { query: jest.fn() },
          ensOwner: { query: jest.fn() },
          collections: { query: jest.fn() },
          landManager: { query: queryMock }
        }
      })
      const notOwnedParcels = generateGetParcelResponseFromPointers(
        [
          [0, 1],
          [2, 3],
          [4, 5],
          [5, 6]
        ],
        '0xDifferent'
      )
      queryMock
        .mockResolvedValueOnce(
          generateGetParcelResponseFromPointers(
            [
              [0, 1],
              [2, 3],
              [4, 5],
              [5, 6]
            ],
            '0xAddress'
          )
        )
        .mockImplementation((_query, variables) => {
          if (variables.x === 9 && variables.y === 9) return Promise.resolve(notOwnedParcels)
          if (variables.owner === '0xdifferent')
            return Promise.resolve({
              authorizations: [
                { type: 'Operator', isApproved: false },
                { type: 'ApprovalForAll', isApproved: false },
                { type: 'UpdateManager', isApproved: false }
              ]
            })
        })
      const validateFn = createSceneValidateFn(
        buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs: subgraphsMocks })
      )
      response = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return an error for the failing parcel and skip the remaining checks', () => {
      expect(response.ok).toBe(false)
      expect(response.errors).toContain('The provided Eth Address does not have access to the following parcel: (9,9)')
      expect(subgraphsMocks.L1.landManager.query).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ x: 2, y: 3 })
      )
      expect(subgraphsMocks.L1.landManager.query).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ x: 4, y: 5 })
      )
      expect(subgraphsMocks.L1.landManager.query).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ x: 5, y: 6 })
      )
    })
  })

  describe('and a pointer fails validation with concurrency=2', () => {
    let response: ValidationResponse

    beforeEach(async () => {
      process.env.SCENE_VALIDATIONS_CONCURRENCY = '2'
      const deployment = buildSceneDeployment(['0,1', '2,3', '9,9', '4,5', '5,6', '4,4', '4,4', '9,9', '9,9'])
      const externalCalls = buildExternalCalls({
        isAddressOwnedByDecentraland: () => true,
        ownerAddress: () => '0xAddress'
      })
      const queryMock = jest.fn()
      const subgraphsMocks = buildSubGraphs({
        L1: {
          blocks: { query: jest.fn() },
          ensOwner: { query: jest.fn() },
          collections: { query: jest.fn() },
          landManager: { query: queryMock }
        }
      })
      const notOwnedParcels = generateGetParcelResponseFromPointers(
        [
          [0, 1],
          [2, 3],
          [4, 5],
          [5, 6]
        ],
        '0xDifferent'
      )
      queryMock.mockImplementation((_query, variables) => {
        if (variables.x === 9 && variables.y === 9) return Promise.resolve(notOwnedParcels)
        if (variables.owner === '0xdifferent')
          return Promise.resolve({
            authorizations: [
              { type: 'Operator', isApproved: false },
              { type: 'ApprovalForAll', isApproved: false },
              { type: 'UpdateManager', isApproved: false }
            ]
          })
        return generateGetParcelResponseFromPointers(
          [
            [0, 1],
            [2, 3],
            [4, 5],
            [5, 6]
          ],
          '0xAddress'
        )
      })
      const validateFn = createSceneValidateFn(
        buildSubgraphAccessCheckerComponents({ externalCalls, subGraphs: subgraphsMocks })
      )
      response = await validateFn(deployment)
    })

    afterEach(() => {
      jest.resetAllMocks()
    })

    it('should return a single error and abort the remaining checks', () => {
      expect(response.ok).toBe(false)
      expect(response.errors?.length).toBe(1)
    })
  })
})
