module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        // Override the package-level `module: commonjs` so ts-jest emits ESM
        // for the test runner (jest is launched with --experimental-vm-modules).
        tsconfig: { module: 'esnext', target: 'es2024', moduleResolution: 'bundler' }
      }
    ]
  },
  coverageProvider: 'v8',
  coveragePathIgnorePatterns: ['node_modules'],
  collectCoverageFrom: ['src/ADR32.ts', 'src/ADR62.ts', 'src/_layout.ts', 'src/node.ts'],
  coverageThreshold: {
    'src/ADR32.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    'src/ADR62.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    'src/node.ts': { branches: 90, functions: 90, lines: 90, statements: 90 }
  },
  moduleFileExtensions: ['ts', 'js', 'json']
}
