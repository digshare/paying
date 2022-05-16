/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/test/*.test.ts'],
  globals: {
    'ts-jest': {
      diagnostics: {
        ignoreCodes: ['TS151001'],
      },
    },
  },
};
