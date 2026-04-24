module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  coverageProvider: 'v8',
  coveragePathIgnorePatterns: ['node_modules'],
  collectCoverageFrom: ['dist/ADR32.js', 'dist/ADR62.js', 'dist/node.js'],
  coverageThreshold: {
    'src/ADR32.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    'src/ADR62.ts': { branches: 90, functions: 90, lines: 90, statements: 90 },
    'src/node.ts': { branches: 90, functions: 90, lines: 90, statements: 90 }
  },
  moduleFileExtensions: ['ts', 'js', 'json']
}
