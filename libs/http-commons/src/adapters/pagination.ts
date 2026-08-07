import type { PaginatedParameters } from '@dcl/schemas'

const MAX_LIMIT = 100

// Strictly parse a base-10, non-negative integer string. Unlike parseInt, this rejects
// lenient inputs such as "1e2" or "10abc" (which parseInt would turn into 1 and 10),
// returning null so the caller can fall back to a default.
function parseNonNegativeInt(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) {
    return null
  }
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function getPaginationParams(params: URLSearchParams): Required<PaginatedParameters> {
  const parsedLimit = parseNonNegativeInt(params.get('limit'))
  const parsedOffset = parseNonNegativeInt(params.get('offset'))

  const paginationLimit = parsedLimit !== null && parsedLimit <= MAX_LIMIT && parsedLimit > 0 ? parsedLimit : MAX_LIMIT
  const paginationOffset = parsedOffset !== null && parsedOffset >= 0 ? parsedOffset : 0

  return {
    limit: paginationLimit,
    offset: paginationOffset
  }
}
