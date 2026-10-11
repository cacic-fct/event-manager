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

// Exercise the real formatter and staged-file configuration without touching
// this checkout's index or creating a commit.
const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const { default: lintStaged } = await import(pathToFileURL(join(root, 'node_modules/lint-staged/lib/index.js')));
const sandbox = mkdtempSync(join(tmpdir(), 'git hooks verification '));
const originalPath = process.env.PATH;
const hook = readFileSync(join(root, '.husky/pre-commit'), 'utf8');
assert.ok(!hook.includes('\r'), 'Hook files must use LF line endings');

function git(...args) {
  const result = spawnSync('git', args, { cwd: sandbox, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}

async function format() {
  // Most repositories have a formatting-only hook. Execute it through Git,
  // including Husky's shell entrypoint and Bun's local executable resolution.
  // Sites with extra lint commands test their staged formatter separately.
  if (hook.trim() === 'bun run format:staged') {
    const result = spawnSync('git', ['hook', 'run', 'pre-commit'], {
      cwd: sandbox,
      encoding: 'utf8',
      env: { ...process.env, HUSKY: '1' },
    });
    if (result.error) throw result.error;
    return result.status === 0;
  }
  return lintStaged({
    cwd: sandbox,
    config: manifest['lint-staged'],
    stash: false,
    hidePartiallyStaged: true,
    quiet: true,
  });
}

try {
  process.env.PATH = `${join(root, 'node_modules/.bin')}${delimiter}${originalPath}`;
  symlinkSync(
    join(root, 'node_modules'),
    join(sandbox, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  for (const name of readdirSync(root)) {
    if (name.startsWith('.prettier')) copyFileSync(join(root, name), join(sandbox, name));
  }
  git('init', '--quiet');
  git('config', 'core.autocrlf', 'false');
  mkdirSync(join(sandbox, '.husky'));
  writeFileSync(join(sandbox, '.husky/pre-commit'), hook);
  copyFileSync(join(root, '.husky/install.mjs'), join(sandbox, '.husky/install.mjs'));
  writeFileSync(
    join(sandbox, 'package.json'),
    JSON.stringify({
      scripts: { 'format:staged': manifest.scripts['format:staged'] },
      'lint-staged': manifest['lint-staged'],
    }),
  );
  const install = spawnSync(process.execPath, ['.husky/install.mjs'], {
    cwd: sandbox,
    encoding: 'utf8',
    env: { ...process.env, CI: 'false', NODE_ENV: 'development', HUSKY: '1' },
  });
  assert.equal(install.status, 0, install.stderr || install.error?.message);
  assert.equal(git('config', '--get', 'core.hooksPath').trim(), '.husky/_');
  process.chdir(sandbox);

  assert.equal(await format(), true, 'An empty index should pass');
  const filename = 'staged file with spaces.js';
  const staged = 'export const staged={value:1}\n';
  writeFileSync(filename, staged);
  git('add', '--', filename);
  // Leave enough unchanged lines between hunks for Git to restore the unstaged
  // edit even when Prettier rewrites the staged line.
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

  assert.equal(await format(), true, 'Formatting should succeed');
  const index = git('show', `:${filename}`);
  assert.match(index, /export const staged = \{ value: 1 \};/);
  assert.doesNotMatch(index, /keep this unstaged/);
  assert.match(readFileSync(filename, 'utf8'), /keep this unstaged/);
  assert.equal(git('show', `:${unknown}`), 'opaque content');
  assert.equal(git('show', `:${ignored}`), 'export const ignored={value:1}\n');

  // Start a fresh index for the failure check. No history or commits are needed.
  git('read-tree', '--empty');
  writeFileSync('invalid.js', 'export const broken = ;\n');
  git('add', '--', 'invalid.js');
  assert.equal(await format(), false, 'Syntax errors must block the commit');
  console.log('Hook formatting checks passed: spaces, partial staging, ignores, unknown types, and syntax failures.');
} finally {
  process.chdir(root);
  process.env.PATH = originalPath;
  rmSync(sandbox, { recursive: true, force: true });
}
