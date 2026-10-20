import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTransferContract } from './transfer-validation.mjs';

test('loads and caches the shared transfer contract directly from source', () => {
  const contract = loadTransferContract();
  const document = {
    format: 'cacic-event-data',
    version: 1,
    resources: [{ kind: 'event', id: 'event-1', data: { name: 'Evento' } }],
  };

  assert.deepEqual(contract.parseTransferJson(JSON.stringify(document)), document);
  assert.throws(() => contract.parseTransferJson(JSON.stringify({ ...document, version: 2 })));
  assert.equal(typeof contract.transferPersonDataError, 'function');
  assert.ok(contract.TransferDocumentSchema);
  assert.strictEqual(loadTransferContract(), contract);
});
