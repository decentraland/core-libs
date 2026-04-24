import rawCollectionsV1 from './collections-v1'
import contracts from './contracts'

export interface Collection {
  collectionId: string
  contractAddress: string
}

const collectionsByContractAddress = new Map<string, Collection>()
const collectionsByName = new Map<string, Collection>()

const lowerCasedContracts: Record<string, Record<string, string>> = {}

const validNetworks = new Set(['ethereum', 'goerli', 'sepolia', 'matic', 'mumbai', 'amoy'])

for (const network in contracts) {
  lowerCasedContracts[network] = Object.create(null)
  const c = lowerCasedContracts[network]
  if (network.toLowerCase() !== 'mainnet') {
    validNetworks.add(network.toLowerCase())
  }
  Object.keys(contracts[network]).forEach((key) => {
    c[key.toLowerCase()] = contracts[network][key]
  })
}

rawCollectionsV1.forEach((collection) => {
  const entry: Collection = {
    contractAddress: collection.id,
    collectionId: collection.name.replace(/^dcl:\/\//, '')
  }
  collectionsByContractAddress.set(entry.contractAddress, entry)
  collectionsByName.set(entry.collectionId, entry)
})

export async function getCollection(addressOrName: string): Promise<Collection | null> {
  return collectionsByContractAddress.get(addressOrName.toLowerCase()) ?? collectionsByName.get(addressOrName) ?? null
}

function mapContract(network: string, contractNameOrAddress: string): string | null {
  if (network === 'ethereum') return mapContract('mainnet', contractNameOrAddress)

  const networkContracts = lowerCasedContracts[network]
  if (networkContracts && contractNameOrAddress in networkContracts) {
    return networkContracts[contractNameOrAddress]
  }

  return null
}

export async function getContract(network: string, contractNameOrAddress: string): Promise<string | null> {
  if (contractNameOrAddress.startsWith('0x')) return contractNameOrAddress
  return mapContract(network.toLowerCase(), contractNameOrAddress.toLowerCase())
}

export function isValidNetwork(protocol: string): boolean {
  return validNetworks.has(protocol.toLowerCase())
}

export type ParserFunction = (original: URL, captures: RegExpExecArray) => Promise<{ url: URL } | undefined>

/** @public */
export type RouteMap<T> = {
  [P in string]: (original: URL, captures: Record<string, string>) => Promise<T | null | void>
}

interface CompiledRoute<T> {
  regex: RegExp
  handler: (original: URL, captures: Record<string, string>) => Promise<T | null | void>
}

const placeholderPattern = /(?:{([a-zA-Z_][a-zA-Z_0-9]*)(\([^}]+\))?})/g

function compileRouteExpression(expression: string): RegExp {
  const source = expression.replace(placeholderPattern, (_match, name, matcher) => {
    return `(?<${name}>${matcher || '[^:]+'})`
  })
  return new RegExp(`^${source}$`)
}

/**
 * @public
 */
export function createParser<T>(handlers: RouteMap<T>): (urn: string) => Promise<T | null> {
  const routes: Array<CompiledRoute<T>> = []
  for (const expression in handlers) {
    routes.push({ regex: compileRouteExpression(expression), handler: handlers[expression] })
  }

  return async (urn: string) => {
    const url = new URL(urn)

    if (url.protocol !== 'urn:') return null

    for (const { regex, handler } of routes) {
      const res = regex.exec(url.pathname)
      if (!res) continue

      const groups: Record<string, string> = Object.create(null)
      if (res.groups) {
        for (const key in res.groups) {
          groups[key] = decodeURIComponent(res.groups[key])
        }
      }
      const match = await handler(url, groups)
      if (match) return match as T
    }
    return null
  }
}
