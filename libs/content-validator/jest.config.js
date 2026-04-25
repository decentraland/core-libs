module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  collectCoverageFrom: ['src/**/*.ts', '!**/*.d.ts'],
  moduleFileExtensions: ['ts', 'js', 'json']
}
