import assert from 'node:assert/strict';
import test from 'node:test';
import { assertConfig, quoteMysqlIdentifier, toAmountInCents, toSourceBoolean } from './core.mjs';

const uuid = '00000000-0000-7000-8000-000000000001';

test('converts EvComp decimal amounts to integer cents without floating-point rounding', () => {
  assert.equal(toAmountInCents('19.90'), 1990);
  assert.equal(toAmountInCents(0.29), 29);
  assert.equal(toAmountInCents('0.00'), 0);
  for (const value of [null, undefined, '-1', '0.001', 'NaN', '21474836.48']) {
    assert.throws(() => toAmountInCents(value), /amount/);
  }
});

test('parses MySQL booleans without treating string zero as true', () => {
  assert.equal(toSourceBoolean(1), true);
  assert.equal(toSourceBoolean('0'), false);
  assert.throws(() => toSourceBoolean('false'), /Unexpected EvComp boolean/);
});

test('validates only JSON-export settings and mapping references', () => {
  assert.doesNotThrow(() =>
    assertConfig({
      sourceNamespace: 'evcomp',
      sourceSchema: { users: { table: 'usuarios' } },
      eventMappings: [{ sourceEventId: 1, targetMajorEventId: uuid }],
      activityMappings: [{ sourceActivityId: 2, targetEventId: uuid }],
      modalityMappings: [{ sourceModalityId: 3, targetPriceTierId: uuid }],
      personMappings: [{ sourcePersonId: 4, targetPersonId: uuid }],
    }),
  );
  assert.throws(() => assertConfig({ actorId: uuid }), /Unsupported configuration option: actorId/);
  assert.throws(() => assertConfig({ eventMappings: {} }), /eventMappings must be an array/);
  assert.throws(
    () => assertConfig({ personMappings: [{ sourcePersonId: 1, targetPersonId: 'invalid' }] }),
    /must be a UUID/,
  );
  assert.throws(
    () =>
      assertConfig({
        eventMappings: [
          { sourceEventId: 1, targetMajorEventId: uuid },
          { sourceEventId: '1', targetMajorEventId: uuid },
        ],
      }),
    /Duplicate source event mapping/,
  );
  assert.throws(() => assertConfig({ sourceNamespace: ' evcomp' }), /sourceNamespace/);
  assert.throws(() => assertConfig({ sourceSchema: [] }), /sourceSchema must be a JSON object/);
});

test('quotes supported MySQL identifiers and rejects SQL fragments', () => {
  assert.equal(quoteMysqlIdentifier('inscrição'), '`inscrição`');
  assert.throws(() => quoteMysqlIdentifier('users; DROP TABLE users'), /Unsafe MySQL identifier/);
});
