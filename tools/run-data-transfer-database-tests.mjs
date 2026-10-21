import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { requireDataTransferTestDatabase } from './data-transfer-test-database.mjs';

let databaseUrl;
try {
  databaseUrl = requireDataTransferTestDatabase(process.env.DATA_TRANSFER_TEST_DATABASE_URL);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

// Provisioning and migration are separate explicit steps. This runner only tests
// an already migrated disposable database, and fails if the suite is not found.
const result = spawnSync(
  process.execPath,
  [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    '--config=apps/backend/jest.data-transfer.postgres.config.mts',
    '--runInBand',
    '--passWithNoTests=false',
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DATA_TRANSFER_TEST_DATABASE_URL: databaseUrl,
      DATA_TRANSFER_POSTGRES_TEST: '1',
    },
  },
);
if (result.error) console.error(`Unable to start PostgreSQL tests: ${result.error.code ?? result.error.name}.`);
process.exit(result.status ?? 1);
