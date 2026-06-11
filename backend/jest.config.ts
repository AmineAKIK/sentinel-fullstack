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
    'src/modules/accounts/accounts.service.ts',
    'src/modules/lines/lines.service.ts',
    'src/modules/workshop/workshop.service.ts',
  ],
  // Integration tests live under src/integration/ and require a real DB.
  // They are not excluded here — the test files skip themselves when DATABASE_URL
  // is absent, so `npm test` always works without a DB.
  // In CI, the integration job sets DATABASE_URL, which activates the suites.
  testTimeout: 30_000,
  projects: [
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src'],
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/src/integration/'],
      moduleFileExtensions: ['ts', 'js'],
    },
    {
      displayName: 'integration',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/src/integration'],
      testMatch: ['<rootDir>/src/integration/**/__tests__/**/*.test.ts'],
      moduleFileExtensions: ['ts', 'js'],
      testTimeout: 30_000,
    },
  ],
};

export default config;
