import { hashV0, hashV1 } from './node'

/**
 * EntityContent as specified in ADR32
 * @public
 */
export interface EntityContentItemReference {
  file: string
  hash: string
}

export interface CalculateMultipleHashesResult {
  data: Uint8Array
  hash: string
}

export function sortKeys(a: EntityContentItemReference, b: EntityContentItemReference): number {
  return compareStrings(a.hash, b.hash) || compareStrings(a.file, b.file) || 0
}

export function compareStrings(a: string, b: string): number {
  if (a === b) return 0

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a.charAt(i) > b.charAt(i)) return 1
    if (a.charAt(i) < b.charAt(i)) return -1
  }

  if (a.length > b.length) return 1

  return -1
}

export function prepareADR32Data(contents: EntityContentItemReference[], metadata?: unknown): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      content: contents.sort(sortKeys).map((entry) => ({ key: entry.file, hash: entry.hash })),
      metadata
    })
  )
}

/**
 * Calculates the content hash of multiple files to be used consistently by the builder
 * and other content-based applications when hashes need to be stored on-chain.
 *
 * Returns the CIDv1 of the data prepared to sign
 * @public
 */
export async function calculateMultipleHashesADR32(
  contents: EntityContentItemReference[],
  metadata?: unknown
): Promise<CalculateMultipleHashesResult> {
  const data = prepareADR32Data(contents, metadata)

  return {
    data,
    hash: await hashV1(data)
  }
}

/**
 * Calculates the content hash of multiple files to be used consistently by the builder
 * and other content-based applications when hashes need to be stored on-chain.
 *
 * @deprecated this is maintained only for compatibility reasons with calculateBufferHash (Qm prefix)
 * @public
 */
export async function calculateMultipleHashesADR32LegacyQmHash(
  contents: EntityContentItemReference[],
  metadata?: unknown
): Promise<CalculateMultipleHashesResult> {
  const data = prepareADR32Data(contents, metadata)

  return {
    data,
    hash: await hashV0(data)
  }
}
