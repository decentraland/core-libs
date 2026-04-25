import type { ILoggerComponent } from '@well-known-components/interfaces'
import type { ISubgraphComponent } from '@well-known-components/thegraph-component'
import type { BlockSearch } from '@dcl/block-indexer'
import type { AuthChain, Entity, EthAddress } from '@dcl/schemas'
import type {
  BlockchainCollectionThirdParty,
  BlockchainCollectionV1Asset,
  BlockchainCollectionV2Asset
} from '@dcl/urn-resolver'
import type { PermissionResult } from './validations/access/subgraph/the-graph-client'

export const L1_NETWORKS = ['mainnet', 'kovan', 'rinkeby', 'goerli', 'sepolia']
export const L2_NETWORKS = ['matic', 'mumbai', 'amoy']

/**
 * @public
 */
export interface LocalDeploymentAuditInfo {
  authChain: AuthChain
}

/**
 * @public
 */
export type Errors = string[]

/**
 * @public
 */
export type Warnings = string[]

/**
 * @public
 */
export type EntityWithEthAddress = Entity & {
  ethAddress: string
}

/**
 * Deployment object to be validated by the validator.
 * @public
 */
export interface DeploymentToValidate {
  entity: Entity
  files: Map<string, Uint8Array>
  auditInfo: LocalDeploymentAuditInfo
}

/**
 * External calls interface to be provided by the servers.
 * @public
 */
export interface ExternalCalls {
  isContentStoredAlready: (hashes: string[]) => Promise<Map<string, boolean>>
  fetchContentFileSize: (hash: string) => Promise<number | undefined>
  validateSignature: (
    entityId: string,
    auditInfo: LocalDeploymentAuditInfo,
    timestamp: number
  ) => Promise<{ ok: boolean; message?: string }>
  ownerAddress: (auditInfo: LocalDeploymentAuditInfo) => string
  isAddressOwnedByDecentraland: (address: string) => boolean
  calculateFilesHashes: (files: Map<string, Uint8Array>) => Promise<
    Map<
      string,
      {
        calculatedHash: string
        buffer: Uint8Array
      }
    >
  >
}

/**
 * @public
 */
export interface ValidationResponse {
  ok: boolean
  errors?: Errors
}

/**
 * @public
 */
export type ValidateFn = (deployment: DeploymentToValidate) => Promise<ValidationResponse>

/**
 * @public
 */
export const OK: ValidationResponse = Object.freeze({ ok: true })

/**
 * @public
 */
export const validationFailed = (...error: string[]): ValidationResponse => ({
  ok: false,
  errors: error
})

/**
 * @public
 */
export const fromErrors = (...errors: Errors): ValidationResponse => ({
  ok: errors.length === 0,
  errors: errors.length > 0 ? errors : undefined
})

/**
 * @public
 */
export interface L1Checker {
  checkLAND(ethAddress: string, parcels: Array<[number, number]>, block: number): Promise<boolean[]>
  checkNames(ethAddress: string, names: string[], block: number): Promise<boolean[]>
}

/**
 * @public
 */
export interface L2Checker {
  validateWearables(
    ethAddress: string,
    contractAddress: string,
    assetId: string,
    hashes: string[],
    block: number
  ): Promise<boolean>

  validateThirdParty(tpId: string, root: Buffer, block: number): Promise<boolean>
}

/**
 * @public
 */
export interface ItemChecker {
  checkItems(ethAddress: string, items: string[], block: number): Promise<boolean[]>
}

/**
 * @alpha
 */
export interface ThirdPartyItemChecker {
  checkThirdPartyItems(ethAddress: string, itemUrns: string[], block: number): Promise<boolean[]>
}

/**
 * A list with all sub-graphs used for validations.
 * @public
 */
export interface SubGraphs {
  L1: {
    landManager: ISubgraphComponent
    blocks: ISubgraphComponent
    collections: ISubgraphComponent
    ensOwner: ISubgraphComponent
  }
  L2: {
    blocks: ISubgraphComponent
    collections: ISubgraphComponent
    thirdPartyRegistry: ISubgraphComponent
  }
}

export interface NamesOwnership {
  ownsNamesAtTimestamp: (ethAddress: EthAddress, namesToCheck: string[], timestamp: number) => Promise<PermissionResult>
}

export interface ItemsOwnership {
  ownsItemsAtTimestamp: (ethAddress: EthAddress, urnsToCheck: string[], timestamp: number) => Promise<PermissionResult>
}

/**
 * @public
 */
export type TheGraphClient = NamesOwnership &
  ItemsOwnership & {
    findBlocksForTimestamp: (subgraph: ISubgraphComponent, timestamp: number) => Promise<BlockInformation>
  }

/**
 * @public
 */
export type OnChainClient = NamesOwnership &
  ItemsOwnership & {
    findBlocksForTimestamp: (timestamp: number, blockSearch: BlockSearch) => Promise<BlockInformation>
  }

/**
 * @public
 */
export interface BlockInformation {
  blockNumberAtDeployment: number | undefined
  blockNumberFiveMinBeforeDeployment: number | undefined
}

/**
 * Components that can be used to validate deployments.
 * @public
 */
export interface ContentValidatorComponents {
  logs: ILoggerComponent
  externalCalls: ExternalCalls
  accessValidateFn: ValidateFn
}

/**
 * @public
 */
export type SubgraphAccessCheckerComponents = Pick<ContentValidatorComponents, 'logs' | 'externalCalls'> & {
  theGraphClient: TheGraphClient
  subGraphs: SubGraphs
  tokenAddresses: TokenAddresses
}

/**
 * Required Smart Contract addresses.
 * @public
 */
export interface TokenAddresses {
  estate: EthAddress
  land: EthAddress
}

/**
 * @public
 */
export type OnChainAccessCheckerComponents = Pick<ContentValidatorComponents, 'logs' | 'externalCalls'> & {
  client: OnChainClient
  L1: {
    checker: L1Checker
    collections: ItemChecker
    thirdParty: ThirdPartyItemChecker
    blockSearch: BlockSearch
  }
  L2: {
    checker: L2Checker
    collections: ItemChecker
    thirdParty: ThirdPartyItemChecker
    blockSearch: BlockSearch
  }
}

/**
 * @internal
 */
export type V1andV2collectionAssetValidateFn = (
  asset: BlockchainCollectionV1Asset | BlockchainCollectionV2Asset,
  deployment: DeploymentToValidate
) => Promise<ValidationResponse>

/**
 * @internal
 */
export type ThirdPartyAssetValidateFn = (
  asset: BlockchainCollectionThirdParty,
  deployment: DeploymentToValidate
) => Promise<ValidationResponse>
