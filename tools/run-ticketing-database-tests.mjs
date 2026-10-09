import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Use an already migrated disposable database. This runner never starts services
// or applies migrations, and it never falls back to the application's database.
const value = process.env.TICKETING_TEST_DATABASE_URL;
let databaseUrl;
try {
  databaseUrl = value ? new URL(value) : undefined;
} catch {
  // Report a safe configuration error without exposing credentials.
}
if (
  !databaseUrl ||
  !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
  !['localhost', '127.0.0.1'].includes(databaseUrl.hostname) ||
  databaseUrl.pathname !== '/fct_app_ticketing_test'
) {
  console.error('Set TICKETING_TEST_DATABASE_URL to a loopback PostgreSQL database named fct_app_ticketing_test.');
  process.exit(1);
}

const result = spawnSync(
  process.platform === 'win32' ? 'bunx.cmd' : 'bunx',
  [
    'nx', 'test', 'backend', '--runInBand', '--skipNxCache', '--coverage=false',
    '--passWithNoTests=false', '--runTestsByPath',
    fileURLToPath(new URL('../apps/backend/src/app/tickets/ticketing.database.integration.spec.ts', import.meta.url)),
    ...process.argv.slice(2),
  ],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    env: { ...process.env, TICKETING_POSTGRES_INTEGRATION_TEST: '1', NX_DAEMON: 'false' },
  },
);
if (result.error) {
  console.error(`Unable to start the ticketing test runner: ${result.error.code ?? result.error.name}.`);
}
process.exit(result.status ?? 1);
