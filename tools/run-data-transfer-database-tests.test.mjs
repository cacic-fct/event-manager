import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { requireDataTransferTestDatabase } from './data-transfer-test-database.mjs';

for (const [label, value] of [
  ['missing URL', ''],
  ['malformed URL', 'secret-value'],
  ['application database', 'postgresql://user:secret@localhost/fct_app'],
  ['remote server', 'postgresql://user:secret@example.test/fct_app_data_transfer_test'],
  ['alternate protocol', 'https://user:secret@localhost/fct_app_data_transfer_test'],
  ['host override', 'postgresql://user:secret@localhost/fct_app_data_transfer_test?host=example.test'],
  ['database override', 'postgresql://user:secret@localhost/fct_app_data_transfer_test?dbname=fct_app'],
  ['session options', 'postgresql://user:secret@localhost/fct_app_data_transfer_test?options=unsafe'],
  ['fragment', 'postgresql://user:secret@localhost/fct_app_data_transfer_test#secret'],
]) {
  test(`rejects ${label} before opening a connection or exposing credentials`, () => {
    const result = spawnSync(process.execPath, ['tools/run-data-transfer-database-tests.mjs'], {
      encoding: 'utf8',
      env: { ...process.env, DATA_TRANSFER_TEST_DATABASE_URL: value },
    });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Set DATA_TRANSFER_TEST_DATABASE_URL/);
    assert.doesNotMatch(result.stderr, /secret/);
  });
}

test('accepts the explicitly named disposable database on either loopback hostname', () => {
  for (const host of ['localhost', '127.0.0.1']) {
    const value = `postgresql://user:password@${host}:5433/fct_app_data_transfer_test`;
    assert.equal(requireDataTransferTestDatabase(value), value);
  }
});
