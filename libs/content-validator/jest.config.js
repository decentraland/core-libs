const preset = require('../../jest.preset')

module.exports = {
  ...preset,
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  }
}
