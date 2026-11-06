import backend from './jest.config.mts';

if (!process.env['SUBSCRIPTION_COUNTERS_TEST_DATABASE_URL']) {
  throw new Error(
    'Set SUBSCRIPTION_COUNTERS_TEST_DATABASE_URL to a loopback fct_app_subscription_counters_test database.',
  );
}

export default {
  ...backend,
  displayName: 'subscription-counters-postgres',
  testMatch: ['<rootDir>/src/app/events/subscription-counters.postgres.spec.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: false,
};
