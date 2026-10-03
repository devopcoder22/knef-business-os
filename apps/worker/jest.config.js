/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@knef/constants$': '<rootDir>/../../../packages/constants/src/index.ts',
    '^@knef/types$': '<rootDir>/../../../packages/types/src/index.ts',
    '^@knef/database$': '<rootDir>/../../../packages/database/src/index.ts',
    '^@knef/utils$': '<rootDir>/../../../packages/utils/src/index.ts',
  },
};
