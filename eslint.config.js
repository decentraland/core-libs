const dclCoreServices = require('@dcl/eslint-config/core-services.config')

module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.config.js',
      '**/jest.preset.js',
      'libs/urn-resolver/src/contracts.ts',
      'libs/urn-resolver/src/collections-v1.ts'
    ]
  },
  ...dclCoreServices,
  {
    files: ['libs/*/src/**/*.ts', 'libs/*/test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['libs/*/tsconfig.eslint.json'],
        tsconfigRootDir: __dirname
      }
    }
  }
]
