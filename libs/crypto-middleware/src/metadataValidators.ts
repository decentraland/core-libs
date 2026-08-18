/**
 * Composable `metadataValidator` predicates.
 *
 * These exist because services identify the caller by comparing a metadata field for equality, and
 * since 6.0.0 the library canonicalizes nothing — the metadata reaches the validator exactly as the
 * client signed it. A value that differs only in case or padding therefore fails an exact match and
 * reads as something the request is not. These predicates close that by *rejecting* a non-canonical
 * value rather than folding it, so the comparison that follows is meaningful and nothing is
 * silently rewritten.
 *
 * Nothing here runs unless a service composes it into `metadataValidator`; the library holds no
 * opinion about which fields exist or what their values mean.
 */

/** A predicate suitable for the `metadataValidator` option. */
export type MetadataPredicate<P extends Record<string, unknown> = Record<string, unknown>> = (metadata: P) => boolean

const SIGNER = 'signer'

function isCanonical(value: string): boolean {
  return value === value.trim().toLowerCase()
}

/**
 * Reads a field only when the metadata object owns it.
 *
 * A plain property read walks the prototype chain, so a polluted `Object.prototype` would supply a
 * `signer` that no client ever sent — enough for `requireSigner` to accept a request carrying no
 * signer at all. `JSON.parse` cannot pollute the prototype on its own (it materializes `__proto__`
 * as an own property), but consumer code that later spreads or `Object.assign`s metadata into
 * another object can, so the gate must not depend on that never having happened.
 */
function ownField(metadata: Record<string, unknown> | undefined, field: string): unknown {
  if (metadata === null || metadata === undefined || !Object.prototype.hasOwnProperty.call(metadata, field)) {
    return undefined
  }

  return metadata[field]
}

function assertCanonicalArguments(fn: string, values: string[]): void {
  if (values.length === 0) {
    throw new Error(`${fn}() requires at least one signer`)
  }

  // A non-canonical argument could never match a value that passed the canonical check, so the
  // predicate would silently never fire. Failing at wiring time makes that a startup error rather
  // than an authorization gap nobody notices.
  const offending = values.filter((value) => !isCanonical(value))
  if (offending.length > 0) {
    throw new Error(`${fn}() expects canonical (trimmed, lowercase) values, got: ${offending.join(', ')}`)
  }
}

/**
 * Requires `field`, when present, to already be trimmed and lowercase.
 *
 * Absent passes — absence is a question for the predicate you combine this with, not for canonical
 * form. A present non-string fails: it is not "the form we need" either.
 *
 * Use it for fields this module has no dedicated helper for, e.g. `intent`:
 *
 * ```ts
 * metadataValidator: (m) => canonicalField('intent')(m) && m.intent === 'dcl:explorer:comms-handshake'
 * ```
 *
 * @param field - Metadata property name to check.
 * @returns A predicate that is true when the field is absent or canonical.
 */
export function canonicalField<P extends Record<string, unknown> = Record<string, unknown>>(
  field: string
): MetadataPredicate<P> {
  return (metadata: P): boolean => {
    const value = ownField(metadata, field)
    if (value === undefined) {
      return true
    }

    return typeof value === 'string' && isCanonical(value)
  }
}

/**
 * Rejects requests whose `signer` is one of `signers` — the "this endpoint is not for scenes" gate.
 *
 * ```ts
 * metadataValidator: rejectIfSigner('decentraland-kernel-scene')
 * ```
 *
 * A request with no `signer` passes: it is not claiming to be any of them. A `signer` that is
 * present but not canonical is rejected rather than compared, so a re-spelled value cannot read as
 * absent and slip through the gate.
 *
 * @param signers - Canonical signer values to refuse.
 * @returns A predicate that is false for those signers and for non-canonical ones.
 * @throws Error at construction when called with no values, or with a non-canonical one.
 */
export function rejectIfSigner<P extends Record<string, unknown> = Record<string, unknown>>(
  ...signers: string[]
): MetadataPredicate<P> {
  assertCanonicalArguments('rejectIfSigner', signers)
  const canonical = canonicalField<P>(SIGNER)

  return (metadata: P): boolean => canonical(metadata) && !signers.includes(ownField(metadata, SIGNER) as string)
}

/**
 * Requires `signer` to be one of `signers` — the "this endpoint is only for scenes" gate.
 *
 * ```ts
 * metadataValidator: requireSigner('decentraland-kernel-scene', 'dcl:authoritative-server')
 * ```
 *
 * Fails closed: a missing `signer`, a non-canonical one, and one outside the list are all refused.
 *
 * @param signers - Canonical signer values to accept.
 * @returns A predicate that is true only for exactly those signers.
 * @throws Error at construction when called with no values, or with a non-canonical one.
 */
export function requireSigner<P extends Record<string, unknown> = Record<string, unknown>>(
  ...signers: string[]
): MetadataPredicate<P> {
  assertCanonicalArguments('requireSigner', signers)
  const canonical = canonicalField<P>(SIGNER)

  return (metadata: P): boolean => {
    const signer = ownField(metadata, SIGNER)
    return canonical(metadata) && typeof signer === 'string' && signers.includes(signer)
  }
}
