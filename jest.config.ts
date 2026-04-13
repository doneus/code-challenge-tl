import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/apps/api/test', '<rootDir>/apps/relay/test', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@app/shared/(.*)$': '<rootDir>/apps/shared/src/$1',
  },
  collectCoverageFrom: ['apps/**/*.ts', '!apps/**/*.entity.ts', '!apps/**/main.ts'],
  passWithNoTests: true,
};

export default config;