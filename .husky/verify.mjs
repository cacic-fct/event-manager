import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { format as formatMessage } from 'node:util';

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { default: lintStaged } = await import(pathToFileURL(join(root, 'node_modules/lint-staged/lib/index.js')));
const sandbox = mkdtempSync(join(tmpdir(), 'git hooks verification '));
const originalPath = process.env.PATH;
const hook = readFileSync(join(root, '.husky/pre-commit'), 'utf8');
assert.ok(!hook.includes('\r'), 'Hook files must use LF line endings');
let formatDiagnostics = '';

function diagnostics(command, result) {
  return [
    `Command: ${command}`,
    `Exit status: ${result.status}; signal: ${result.signal ?? 'none'}`,
    `Platform: ${process.platform}; Node: ${process.version}`,
    `Working directory: ${sandbox}`,
    result.error?.stack,
    result.stdout?.trim(),
    result.stderr?.trim(),
  ]
    .filter(Boolean)
    .join('\n');
}

function verifyMessage(message) {
  return `${message}\n${formatDiagnostics}`;
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: sandbox, encoding: 'utf8' });
  assert.equal(result.status, 0, diagnostics(`git ${args.map((arg) => JSON.stringify(arg)).join(' ')}`, result));
  return result.stdout;
}

async function format() {
  if (hook.trim() === 'bun run format:staged') {
    const result = spawnSync('git', ['hook', 'run', 'pre-commit'], {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, HUSKY: '1' },
    });
    formatDiagnostics = diagnostics('git hook run pre-commit', result);
    return result.status === 0;
  }
  const output = [];
  const logger = Object.fromEntries(
    ['log', 'warn', 'error'].map((level) => [level, (...args) => output.push(formatMessage(...args))]),
  );
  const passed = await lintStaged(
    {
      cwd: sandbox,
      config: manifest['lint-staged'],
      stash: false,
      hidePartiallyStaged: true,
      quiet: true,
    },
    logger,
  );
  formatDiagnostics = [
    `Command: lint-staged API`,
    `Platform: ${process.platform}; Node: ${process.version}`,
    `Working directory: ${sandbox}`,
    ...output,
  ].join('\n');
  return passed;
}

try {
  writeFileSync(
    join(sandbox, 'package.json'),
    JSON.stringify({
      name: 'hook-install-verification',
      version: '0.0.0',
      private: true,
      scripts: { prepare: manifest.scripts.prepare },
    }),
  );
  for (const flags of [[], ['--production']]) {
    const args = ['install', '--frozen-lockfile', ...flags];
    const result = spawnSync('bun', args, {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, CI: 'false', NODE_ENV: 'development', HUSKY: '1' },
    });
    assert.equal(
      result.status,
      0,
      [
        `Manifest-only ${args.join(' ')} must succeed without .git or .husky.`,
        result.error?.message,
        result.stdout,
        result.stderr,
      ].filter(Boolean).join('\n'),
    );
  }
  rmSync(join(sandbox, 'node_modules'), { recursive: true, force: true });
  process.env.PATH = `${join(root, 'node_modules/.bin')}${delimiter}${originalPath}`;
  symlinkSync(
    join(root, 'node_modules'),
    join(sandbox, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  for (const name of readdirSync(root)) {
    if (name.startsWith('.prettier')) {
      copyFileSync(join(root, name), join(sandbox, name));
    }
  }
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(sandbox, '.husky'));
  writeFileSync(join(sandbox, '.husky/pre-commit'), hook);
  copyFileSync(join(root, '.husky/install.mjs'), join(sandbox, '.husky/install.mjs'));
  writeFileSync(
    join(sandbox, 'package.json'),
    JSON.stringify({
      scripts: {
        prepare: manifest.scripts.prepare,
        'format:staged': manifest.scripts['format:staged'],
      },
      'lint-staged': manifest['lint-staged'],
    }),
  );
  const install = spawnSync('bun', ['run', 'prepare'], {
    cwd: sandbox,
    encoding: 'utf8',
    env: { ...process.env, CI: 'false', NODE_ENV: 'development', HUSKY: '1' },
  });
  assert.equal(install.status, 0, diagnostics('bun run prepare', install));
  assert.equal(git('config', '--get', 'core.hooksPath').trim(), '.husky/_');
  process.chdir(sandbox);

  assert.equal(await format(), true, verifyMessage('An empty index should pass'));
  const filename = 'staged file with spaces.js';
  const staged = 'export const staged={value:1}\n';
  writeFileSync(filename, staged);
  git('add', '--', filename);
  const gap = '\n'.repeat(12);
  writeFileSync(filename, `${staged}${gap}// keep this unstaged\n`);
  const unknown = 'unsupported.fixture';
  writeFileSync(unknown, 'opaque content');
  git('add', '--', unknown);
  const ignored = 'hook-ignored.js';
  writeFileSync(
    '.prettierignore',
    `${existsSync('.prettierignore') ? readFileSync('.prettierignore', 'utf8') : ''}\n${ignored}\n`,
  );
  writeFileSync(ignored, 'export const ignored={value:1}\n');
  git('add', '--', ignored);

  assert.equal(await format(), true, verifyMessage('Formatting should succeed'));
  const index = git('show', `:${filename}`);
  assert.match(index, /export const staged = \{ value: 1 \};/);
  assert.doesNotMatch(index, /keep this unstaged/);
  assert.match(readFileSync(filename, 'utf8'), /keep this unstaged/);
  assert.equal(git('show', `:${unknown}`), 'opaque content');
  assert.equal(git('show', `:${ignored}`), 'export const ignored={value:1}\n');

  git('read-tree', '--empty');
  writeFileSync('invalid.js', 'export const broken = ;\n');
  git('add', '--', 'invalid.js');
  assert.equal(await format(), false, verifyMessage('Syntax errors must block the commit'));
  assert.match(
    formatDiagnostics,
    /SyntaxError|Unexpected token/,
    verifyMessage('The rejected hook must report the invalid fixture syntax'),
  );
  console.log('Hook checks passed: manifest-only installs, Git checkout installation, spaces, partial staging, ignores, unknown types, and syntax failures.');
} finally {
  process.chdir(root);
  process.env.PATH = originalPath;
  rmSync(sandbox, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
