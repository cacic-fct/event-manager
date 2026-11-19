import { spawn } from 'node:child_process';
import { chmod, mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const clusterRoot = await mkdtemp(join(tmpdir(), 'fct-mcp-postgres-'));
await chmod(clusterRoot, 0o700);
const dataDirectory = join(clusterRoot, 'data');
let started = false;
let startAttempted = false;
let activeChild;
let interrupted = false;
const toolEnv = {
  ...process.env,
  PGPASSFILE: join(clusterRoot, 'unused.pgpass'),
  PGSERVICEFILE: join(clusterRoot, 'unused.pg_service.conf'),
};
for (const key of ['PGPASSWORD', 'PGSERVICE', 'PGDATABASE', 'PGHOST', 'PGHOSTADDR', 'PGPORT', 'PGUSER', 'PGOPTIONS']) {
  delete toolEnv[key];
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    activeChild?.kill(signal);
  });
}
let exitCode = 1;
let pgCtl;

function run(executable, args, options = {}) {
  if (interrupted && !options.cleanup) throw new Error('MCP PostgreSQL integration run was interrupted.');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      cwd: workspace,
      stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
      env: options.env ?? toolEnv,
    });
    activeChild = child;
    // Provisioning output may contain connection details. Report only the step and exit status.
    if (!options.inherit) {
      child.stdout.resume();
      child.stderr.resume();
    }
    child.once('error', () => reject(new Error(`Unable to start ${options.label ?? 'PostgreSQL step'}.`)));
    child.once('exit', (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (code === 0) resolve(0);
      else reject(new Error(`${options.label ?? 'PostgreSQL step'} failed (${signal ?? code ?? 'unknown'}).`));
    });
  });
}

async function unusedLoopbackPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to reserve an isolated test port.');
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return address.port;
}

try {
  const binaries = dirname(await realpath('/opt/homebrew/bin/initdb'));
  pgCtl = join(binaries, 'pg_ctl');
  const port = await unusedLoopbackPort();
  await run(
    join(binaries, 'initdb'),
    [
      '-D',
      dataDirectory,
      '--username=fct_mcp_admin',
      '--auth-local=trust',
      '--auth-host=trust',
      '--no-locale',
      '--encoding=UTF8',
    ],
    { label: 'Initializing the disposable cluster' },
  );
  // This cluster has no external listen address, no existing database and no private environment file.
  startAttempted = true;
  await run(
    pgCtl,
    [
      '-D',
      dataDirectory,
      '-l',
      join(clusterRoot, 'postgres.log'),
      '-w',
      'start',
      '-o',
      `-h 127.0.0.1 -p ${port} -k ''`,
    ],
    { label: 'Starting the disposable cluster' },
  );
  started = true;
  await run(
    join(binaries, 'createdb'),
    ['-h', '127.0.0.1', '-p', String(port), '-U', 'fct_mcp_admin', 'fct_mcp_test'],
    { label: 'Creating the isolated MCP test database' },
  );
  const databaseUrl = `postgresql://fct_mcp_admin@127.0.0.1:${port}/fct_mcp_test`;
  await run(
    process.execPath,
    [
      '--experimental-vm-modules',
      'node_modules/jest/bin/jest.js',
      '--config=apps/backend/jest.mcp.postgres.config.mts',
      '--runInBand',
      '--passWithNoTests=false',
      ...process.argv.slice(2),
    ],
    {
      label: 'MCP PostgreSQL integration tests',
      inherit: true,
      env: {
        ...toolEnv,
        DATABASE_URL: databaseUrl,
        MCP_POSTGRES_TEST_DATABASE_URL: databaseUrl,
        MCP_POSTGRES_ISOLATED_CLUSTER: '1',
      },
    },
  );
  exitCode = 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'MCP PostgreSQL integration setup failed.');
} finally {
  if ((started || startAttempted) && pgCtl) {
    try {
      await run(pgCtl, ['-D', dataDirectory, '-m', 'immediate', '-w', 'stop'], {
        label: 'Stopping the disposable cluster',
        cleanup: true,
      });
      started = false;
    } catch {
      console.error('Unable to stop the disposable MCP cluster; its directory was retained for cleanup.');
      started = true;
      exitCode = 1;
    }
  }
  // A failed stop must retain the only data directory identifying the owned running server.
  if (!started) await rm(clusterRoot, { recursive: true, force: true });
}
process.exitCode = exitCode;
