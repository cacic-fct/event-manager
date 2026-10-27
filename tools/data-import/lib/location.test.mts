import assert from 'node:assert/strict';
import test from 'node:test';
import { transferLocationData } from './location.mts';

test('converts historical location text to structured transfer fields', () => {
  assert.deepEqual(transferLocationData(' Auditório - Bloco 5 - Térreo '), {
    isVirtual: false,
    locationName: 'Auditório',
    locationDescription: 'Bloco 5 - Térreo',
  });
  assert.deepEqual(transferLocationData('Auditório'), {
    isVirtual: false,
    locationName: 'Auditório',
    locationDescription: null,
  });
  assert.deepEqual(transferLocationData(null), {
    isVirtual: false,
    locationName: null,
    locationDescription: null,
  });
});

test('clears physical location fields for historical online events', () => {
  assert.deepEqual(transferLocationData(' Evento on-line '), {
    isVirtual: true,
    locationName: null,
    locationDescription: null,
    latitude: null,
    longitude: null,
  });
});
