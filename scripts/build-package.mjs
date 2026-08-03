#!/usr/bin/env node
/**
 * Builds one workspace package: type declarations via tsc, then a bundled CJS and
 * ESM artifact per entry point via esbuild.
 *
 * Entry points are derived from the package's own `exports` map, so the build and
 * the published surface cannot drift apart. `"./foo": { "import": "./dist/foo.mjs" }`
 * builds `src/foo.ts`.
 *
 * Declarations for underscore-prefixed modules are pruned: they are internal, and
 * tsc emits them anyway because public modules import them.
 *
 * Usage: node ../../scripts/build-package.mjs [--watch]
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const watch = process.argv.includes('--watch')
const cwd = process.cwd()
const pkg = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))

function entryPoints() {
  const exports = pkg.exports ?? { '.': { import: './dist/index.mjs' } }
  const entries = new Set()
  for (const target of Object.values(exports)) {
    const imported = typeof target === 'string' ? target : target.import
    const mjs = typeof imported === 'string' ? imported : imported?.default
    if (!mjs) continue
    const name = mjs.replace(/^\.\/dist\//, '').replace(/\.mjs$/, '')
    const source = join('src', `${name}.ts`)
    if (!existsSync(join(cwd, source))) {
      throw new Error(`${pkg.name}: exports references ${mjs} but ${source} does not exist`)
    }
    entries.add(source)
  }
  if (entries.size === 0) throw new Error(`${pkg.name}: no entry points found in exports`)
  return [...entries]
}

const entries = entryPoints()

// Some dependencies expose only an `import` condition (multiformats, for one), so a
// CJS consumer cannot require them at all — not even via Node's require(esm). Packages
// that depend on those must inline them into the CJS artifact; set
// `buildConfig.bundleCjsDependencies` in package.json to opt in.
const bundleCjsDeps = pkg.buildConfig?.bundleCjsDependencies === true
const shared = ['--bundle', '--platform=node', '--outdir=dist', '--sourcemap']
const targets = [
  ['--format=cjs', bundleCjsDeps ? '--external:node:*' : '--packages=external'],
  ['--format=esm', '--out-extension:.js=.mjs', '--packages=external']
]

function esbuildArgs(extra) {
  return [...entries, ...shared, ...extra, ...(watch ? ['--watch'] : [])]
}

function run(cmd, args) {
  execFileSync(cmd, args, { cwd, stdio: 'inherit' })
}

function prunePrivateDeclarations() {
  const dist = join(cwd, 'dist')
  if (!existsSync(dist)) return
  for (const file of readdirSync(dist)) {
    if (file.startsWith('_') && (file.endsWith('.d.ts') || file.endsWith('.d.ts.map'))) {
      unlinkSync(join(dist, file))
    }
  }
}

/**
 * A `.d.ts` is a CommonJS declaration unless the package is `type: module`, so
 * pointing the `import` condition at one makes TypeScript model a genuinely-ESM
 * artifact as CJS interop (attw's FalseCJS). Emit a `.d.mts` per entry — always
 * ESM regardless of package type — and point `import` at that instead.
 */
function writeEsmDeclarations() {
  for (const entry of entries) {
    const name = entry.replace(/^src\//, '').replace(/\.ts$/, '')
    writeFileSync(join(cwd, 'dist', `${name}.d.mts`), `export * from './${name}.js'\n`)
  }
}

rmSync(join(cwd, 'dist'), { recursive: true, force: true })

if (watch) {
  spawn('tsc', ['--emitDeclarationOnly', '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput'], {
    cwd,
    stdio: 'inherit'
  })
  for (const extra of targets) spawn('esbuild', esbuildArgs(extra), { cwd, stdio: 'inherit' })
} else {
  run('tsc', ['--emitDeclarationOnly', '--declarationMap', 'false', '-p', 'tsconfig.json'])
  prunePrivateDeclarations()
  writeEsmDeclarations()
  for (const extra of targets) run('esbuild', esbuildArgs(extra))
}
