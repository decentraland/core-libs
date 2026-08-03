const preset = require('../../jest.preset')

module.exports = {
  ...preset,
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/contracts.ts', '!src/collections-v1.ts', '!**/*.d.ts']
}
