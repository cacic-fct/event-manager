import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { parse } from 'yaml';

const compose = parse(await readFile(new URL('../docker/docker-compose.yml', import.meta.url), 'utf8'));
const backend = compose.services['events-backend'];
const migration = compose.services['events-backend-migrate'];

test('gates API startup on a successful migration of the same release', () => {
  assert.equal(migration.image, backend.image);
  assert.equal(migration.environment.DATABASE_URL, backend.environment.DATABASE_URL);
  assert.deepEqual(migration.depends_on, { 'events-db': { condition: 'service_healthy' } });
  assert.equal(backend.depends_on['events-backend-migrate'].condition, 'service_completed_successfully');
  assert.deepEqual(backend.command, ['node', 'main.js']);
  assert.equal(migration.restart, 'no');
  assert.equal(migration.healthcheck.disable, true);
});

test('isolates migrations from API credentials, public networks and automatic updates', () => {
  assert.deepEqual(Object.keys(migration.environment).sort(), ['DATABASE_URL', 'NODE_ENV']);
  assert.equal(migration.env_file, undefined);
  assert.deepEqual(migration.networks, ['default']);
  assert.equal(migration.ports, undefined);
  assert.ok(migration.labels.includes('traefik.enable=false'));
  assert.ok(migration.labels.includes('wud.watch=false'));
  assert.ok(backend.labels.includes('wud.watch=true'));
  assert.ok(backend.labels.includes('wud.trigger.docker.enabled=false'));
});

async function runMigration(t, { migrationExitCode = 0, missingCli = false } = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'backend-container-')));
  t.after(() => rm(directory, { recursive: true, force: true }));

  await mkdir(join(directory, 'apps/backend'), { recursive: true });
  await mkdir(join(directory, 'node_modules/prisma/build'), { recursive: true });
  if (!missingCli) {
    await writeFile(
      join(directory, 'node_modules/prisma/build/index.js'),
      `
      const assert = require('node:assert/strict');
      const { join } = require('node:path');
      assert.deepEqual(process.argv.slice(2), [
        'migrate', 'deploy', '--config', join(process.cwd(), 'prisma.config.ts'),
      ]);
      console.log('migration invoked');
      process.exit(${migrationExitCode});
    `,
    );
  }
  await writeFile(join(directory, 'main.js'), "console.log('API started');\n");

  // Exercise the Compose command with a disposable CLI, without connecting to a database.
  const localPath = (value) => value.replace(/^\/app(?=\/|$)/, directory);
  const [executable, ...args] = migration.command.map(localPath);
  return spawnSync(executable, args, {
    cwd: localPath(migration.working_dir),
    encoding: 'utf8',
    timeout: 10_000,
  });
}

test('exits successfully after migration without launching the API', async (t) => {
  const result = await runMigration(t);
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'migration invoked\n');
});

test('preserves the migration failure exit code', async (t) => {
  const result = await runMigration(t, { migrationExitCode: 23 });
  assert.ifError(result.error);
  assert.equal(result.status, 23, result.stderr);
  assert.equal(result.stdout, 'migration invoked\n');
});

test('fails when the image is missing the Prisma CLI', async (t) => {
  const result = await runMigration(t, { missingCli: true });
  assert.ifError(result.error);
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /API started/);
});
