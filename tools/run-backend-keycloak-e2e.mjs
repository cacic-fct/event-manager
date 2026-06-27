import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const rootDir = new URL('..', import.meta.url).pathname;
const composeFile = 'docker/docker-compose.keycloak.test.yml';
const keycloakPort = process.env.KEYCLOAK_TEST_PORT || '18080';
const keycloakUrl = `http://localhost:${keycloakPort}`;
const backendPort = process.env.PORT || '3000';
const backendHost = process.env.HOST || 'localhost';
const keepContainer = process.env.KEYCLOAK_TEST_KEEPALIVE === 'true';
const nxE2eArgs = process.argv.slice(2);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with status ${result.status}`);
  }
}

function dockerCompose(args) {
  run('docker', ['compose', '-f', composeFile, ...args]);
}

async function waitForUrl(url, label, timeoutMs = 120_000) {
  const timeoutAt = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < timeoutAt) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
      });
      if (response.ok || response.status === 303) {
        return;
      }

      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(1_000);
  }

  throw new Error(
    `Timed out waiting for ${label} at ${url}: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function buildTestEnv() {
  return {
    ...process.env,
    NODE_ENV: 'test',
    HOST: backendHost,
    PORT: backendPort,
    KEYCLOAK_BACKED_E2E: 'true',
    KEYCLOAK_REALM_URL: `${keycloakUrl}/realms/cacic-sso`,
    KEYCLOAK_CLIENT_ID: 'cacic-event-manager',
    KEYCLOAK_CLIENT_SECRET: 'cacic-event-manager-dev-secret',
    KEYCLOAK_REDIRECT_URI: `http://${backendHost}:${backendPort}/api/auth/callback`,
    KEYCLOAK_POST_LOGIN_REDIRECT_URI: 'http://localhost:4200/admin/',
    KEYCLOAK_POST_LOGOUT_REDIRECT_URI: 'http://localhost:4200/admin/',
    KEYCLOAK_LOGIN_IDP_HINT: '',
    KEYCLOAK_PASSWORD_LOGIN_ENABLED: 'true',
    KEYCLOAK_M2M_CLIENT_ID: 'cacic-event-manager-m2m',
    KEYCLOAK_M2M_CLIENT_SECRET: 'cacic-event-manager-m2m-dev-secret',
    KEYCLOAK_M2M_AUDIENCE: 'cacic-event-manager-audience',
    KEYCLOAK_M2M_ALLOWED_CLIENTS: 'cacic-account-manager-m2m',
    KEYCLOAK_M2M_REQUIRE_SERVICE_ACCOUNT: 'true',
    ACCOUNT_MANAGER_M2M_AUDIENCE: 'cacic-account-manager-audience',
  };
}

async function main() {
  const testEnv = buildTestEnv();
  dockerCompose(['down', '-v', '--remove-orphans']);
  dockerCompose(['up', '-d']);

  await waitForUrl(`${keycloakUrl}/realms/cacic-sso/.well-known/openid-configuration`, 'test Keycloak');

  const backend = spawn(process.platform === 'win32' ? 'bunx.cmd' : 'bunx', ['nx', 'serve', 'backend'], {
    cwd: rootDir,
    env: testEnv,
    stdio: 'inherit',
  });
  const backendExited = new Promise((resolve) => {
    backend.once('exit', (code, signal) => resolve({ code, signal }));
  });

  try {
    await Promise.race([
      waitForUrl(`http://${backendHost}:${backendPort}/api`, 'backend'),
      backendExited.then(({ code, signal }) => {
        throw new Error(`Backend exited before e2e tests started. code=${code} signal=${signal}`);
      }),
    ]);
    run(
      process.platform === 'win32' ? 'bunx.cmd' : 'bunx',
      ['nx', 'e2e', 'backend-e2e', '--runInBand', ...nxE2eArgs],
      {
        env: testEnv,
      },
    );
  } finally {
    if (backend.exitCode === null) {
      backend.kill();
    }
    await backendExited;
  }
}

try {
  await main();
} finally {
  if (!keepContainer) {
    dockerCompose(['down', '-v', '--remove-orphans']);
  }
}
