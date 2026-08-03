const preset = require('../../jest.preset')

module.exports = {
  ...preset,
  testEnvironment: 'jsdom'
}
