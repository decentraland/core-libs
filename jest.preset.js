module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: { allowJs: true, module: 'commonjs', target: 'es2024' } }]
  },
  transformIgnorePatterns: ['node_modules/\\.pnpm/(?!@noble)'],
  collectCoverageFrom: ['src/**/*.ts', '!**/*.d.ts'],
  moduleFileExtensions: ['ts', 'js', 'json']
}
