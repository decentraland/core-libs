import { execFileSync } from 'node:child_process'
import { dirname } from 'node:path'

describe('when loading the built package through Node package exports', () => {
  let result: {
    publicVerifier: string
    legacyImports: string[]
    identityExported: boolean
    scopedValidatorExported: boolean
    privateImports: string[]
  }

  beforeEach(() => {
    result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          `
        const names = ['index', 'types', 'createAuthChainHeaders', 'rpc-provider', 'signature-validation', 'errors', 'verify', 'metadataValidators']
        const legacyImports = names.flatMap(name => ['', '.js'].map(suffix => {
          require('@dcl/crypto-middleware/dist/' + name + suffix)
          return name + suffix
        }))
        const privateImports = ['internal-verification', 'internal-verification.js', 'internal-signature-validation', 'internal-signature-validation.js', 'scoped-authorization'].map(name => {
          try {
            require('@dcl/crypto-middleware/dist/' + name)
            return 'accessible'
          } catch (error) {
            return error.code
          }
        })
        console.log(JSON.stringify({
          publicVerifier: typeof require('@dcl/crypto-middleware').verify,
          legacyImports,
          identityExported: 'verifyIdentity' in require('@dcl/crypto-middleware/dist/verify'),
          scopedValidatorExported: 'validateScopedAuthChainSignature' in require('@dcl/crypto-middleware/dist/signature-validation'),
          privateImports
        }))
      `
        ],
        { cwd: dirname(require.resolve('../../package.json')), encoding: 'utf8' }
      )
    )
  })

  it('should expose the public verifier', () => {
    expect(result.publicVerifier).toBe('function')
  })

  it('should preserve all existing module imports with and without the js extension', () => {
    expect(result.legacyImports).toHaveLength(16)
  })

  it('should omit identity-only verification from the existing verify module', () => {
    expect(result.identityExported).toBe(false)
  })

  it('should omit scoped identity-only validation from the existing signature module', () => {
    expect(result.scopedValidatorExported).toBe(false)
  })

  it('should block private package imports', () => {
    expect(result.privateImports).toEqual(Array(5).fill('ERR_PACKAGE_PATH_NOT_EXPORTED'))
  })
})
