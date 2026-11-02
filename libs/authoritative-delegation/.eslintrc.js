module.exports = {
  extends: ['@dcl/eslint-config/core-services'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.eslint.json']
  },
  ignorePatterns: ['dist', 'coverage', 'node_modules', '.eslintrc.js', 'jest.config.js']
}
