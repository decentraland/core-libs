import { ResolversOptions, resolveContentUrl } from './content-url-resolver'
import { internalResolver, resolveLegacyDclUrl } from './resolvers'
import type { DecentralandAssetIdentifier } from './types'
export * from './types'
export { LandUtils } from './land-utils'
export { resolveContentUrl, ResolversOptions }
export { isExtendedUrn, getTokenIdAndAssetUrn } from './collection-items-utils'

/**
 * Function that parses an URN and returns a DecentralandAssetIdentifier record or null.
 * @public
 */
export async function parseUrn(urn: string): Promise<DecentralandAssetIdentifier | null> {
  let url: URL
  try {
    url = new URL(urn)
  } catch {
    // Malformed input (empty string, non-URL, invalid syntax) resolves to null instead of throwing.
    return null
  }

  if (url.protocol === 'urn:') return internalResolver(urn)
  if (url.protocol === 'dcl:') return (await resolveLegacyDclUrl(url)) || null

  return null
}

/**
 * Returns a resolved (and mutable) content-url for the immutable URN.
 * @public
 */
export async function resolveUrlFromUrn(urn: string, options?: ResolversOptions): Promise<string | null> {
  const parsedUrn = await parseUrn(urn)

  if (parsedUrn) {
    return resolveContentUrl(parsedUrn, options)
  }

  return null
}
