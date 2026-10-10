import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const runner = fileURLToPath(new URL('./run-ticketing-database-tests.mjs', import.meta.url));

for (const [label, value] of [
  ['missing URL', ''],
  ['invalid URL', 'secret-that-must-not-appear'],
  ['application database', 'postgresql://user:secret@localhost/fct_app'],
  ['remote database', 'postgresql://user:secret@example.com/fct_app_ticketing_test'],
  ['non-PostgreSQL URL', 'https://user:secret@localhost/fct_app_ticketing_test'],
]) {
  test(`rejects ${label} without starting the suite or exposing credentials`, () => {
    const result = spawnSync(process.execPath, [runner], {
      encoding: 'utf8',
      env: { ...process.env, TICKETING_TEST_DATABASE_URL: value },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Set TICKETING_TEST_DATABASE_URL/);
    assert.doesNotMatch(result.stderr, /secret/);
  });
}
