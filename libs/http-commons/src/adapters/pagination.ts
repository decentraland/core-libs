import type { PaginatedParameters } from '@dcl/schemas'

const MAX_LIMIT = 100

/**
 * Largest accepted `offset`.
 *
 * Unbounded, the value reaches the database verbatim. Beyond the range of `bigint` Postgres answers
 * `22003 bigint out of range`, which surfaces as a 500 rather than a rejected request, and below
 * that a deep offset still makes the engine walk and discard every skipped row. At the maximum page
 * size this is page one thousand, well past anything a client pages to.
 */
const MAX_OFFSET = 100_000

export function getPaginationParams(params: URLSearchParams): Required<PaginatedParameters> {
  const limit = params.get('limit')
  const offset = params.get('offset')
  const parsedLimit = parseInt(limit as string, 10)
  const parsedOffset = parseInt(offset as string, 10)

  const paginationLimit =
    limit && !isNaN(parsedLimit) && parsedLimit <= MAX_LIMIT && parsedLimit > 0 ? parsedLimit : MAX_LIMIT
  const paginationOffset = !isNaN(parsedOffset) && parsedOffset >= 0 ? Math.min(parsedOffset, MAX_OFFSET) : 0

  return {
    limit: paginationLimit,
    offset: paginationOffset
  }
}
