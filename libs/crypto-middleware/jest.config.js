const preset = require('../../jest.preset')

module.exports = {
  ...preset,
  testMatch: ['**/tests/**/*.spec.ts', '**/tests/**/*.test.ts', '**/?(*.)+(spec|test).ts']
}
