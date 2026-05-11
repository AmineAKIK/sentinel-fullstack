import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js'],
  collectCoverageFrom: [
    'src/utils/**/*.ts',
    'src/domain/**/*.ts',
    'src/modules/workshop/workshop.policy.ts',
    'src/modules/workshop/workshop.validation.ts',
  ],
};

export default config;
