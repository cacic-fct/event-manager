import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createTransferDocuments,
  loadTransferContract,
  writeTransferResources,
  type TransferResource,
} from './transfer.mts';

const event = (index: number): TransferResource => ({
  kind: 'event',
  id: `event-${index}`,
  data: { name: `Evento ${index}` },
});

test('splits at the current resource limit and keeps price tables complete', () => {
  const max = loadTransferContract().TRANSFER_MAX_RESOURCES;
  const resources = Array.from({ length: max - 1 }, (_, index) => event(index));
  resources.push(
    { kind: 'major-event-price', id: 'price', data: { majorEventId: 'major', type: 'SINGLE' } },
    { kind: 'price-tier', id: 'tier', data: { priceId: 'price', name: 'Valor único', value: 100 } },
  );
  const files = createTransferDocuments(resources);
  assert.deepEqual(
    files.map((file) => file.resources.length),
    [max - 1, 2],
  );
  files.forEach((file) => loadTransferContract().parseTransferJson(JSON.stringify(file)));
});

test('splits by pretty-printed byte size as well as resource count', () => {
  const max = loadTransferContract().TRANSFER_MAX_BYTES;
  const resources = Array.from({ length: 100 }, (_, index) => ({
    ...event(index),
    data: { name: `Evento ${index}`, description: 'á'.repeat(40_000) },
  }));
  const files = createTransferDocuments(resources);
  assert.ok(files.length > 1);
  assert.equal(files.flatMap((file) => file.resources).length, resources.length);
  files.forEach((file) => assert.ok(Buffer.byteLength(`${JSON.stringify(file, null, 2)}\n`) <= max));
});

test('rejects invalid fields, duplicate identities across files, and cross-file local keys', () => {
  assert.throws(
    () => createTransferDocuments([{ ...event(0), data: { name: 'Evento', onlineAttendanceCode: 'private' } }]),
    /Estrutura incompatível/,
  );
  const max = loadTransferContract().TRANSFER_MAX_RESOURCES;
  const resources = Array.from({ length: max }, (_, index) => event(index));
  assert.throws(() => createTransferDocuments([...resources, event(0)]), /Duplicate resource/);
  resources[0] = { kind: 'event', key: 'local-event', data: { name: 'Evento' } };
  assert.throws(
    () =>
      createTransferDocuments([
        ...resources,
        {
          kind: 'event-subscription',
          key: 'subscription',
          data: { eventId: 'local-event', person: { name: 'Ana Silva' } },
        },
      ]),
    /crosses JSON files/,
  );
});

test('publishes private validated JSON and refuses to overwrite previous output', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'transfer-output-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const output = join(root, 'result');
  const result = await writeTransferResources(output, [event(0)], { source: 'test' });
  assert.equal(result.files.length, 1);
  assert.equal((await stat(output)).mode & 0o777, 0o700);
  for (const name of await readdir(output)) assert.equal((await stat(join(output, name))).mode & 0o777, 0o600);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8')) as { source: string };
  assert.equal(manifest.source, 'test');
  const file = result.files[0];
  assert.ok(file);
  loadTransferContract().parseTransferJson(await readFile(join(output, file.name), 'utf8'));
  await assert.rejects(writeTransferResources(output, [event(1)]), { code: 'EEXIST' });
  assert.deepEqual(await readdir(root), ['result']);
  await assert.rejects(
    writeTransferResources(join(root, 'invalid'), [{ ...event(0), kind: 'person' }]),
    /Estrutura incompatível/,
  );
  assert.deepEqual(await readdir(root), ['result']);
});

test('Firestore CLI exports validated JSON without a database from another working directory', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'firestore-json-cli-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seconds = Math.floor(Date.now() / 1000);
  const timestamp = (value: number) => ({ __datatype__: 'timestamp', value: { _seconds: value } });
  const input = join(root, 'source.json');
  await writeFile(
    input,
    JSON.stringify({
      __collections__: {
        events: {
          opening: {
            name: 'Abertura',
            eventStartDate: timestamp(seconds),
            eventEndDate: timestamp(seconds + 3600),
          },
        },
      },
    }),
  );
  const result = spawnSync(
    process.execPath,
    [
      new URL('../index.mts', import.meta.url).pathname,
      'firestore-to-json',
      '--input',
      input,
      '--output',
      join(root, 'output'),
    ],
    { cwd: root, env: { PATH: process.env.PATH }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const text = await readFile(join(root, 'output/001-event-data.json'), 'utf8');
  loadTransferContract().parseTransferJson(text);
  assert.match(text, /Abertura/);
  const file = JSON.parse(text) as { resources: Array<{ data: { startDate: string } }> };
  assert.equal(file.resources[0]?.data.startDate, new Date(seconds * 1000).toISOString());
});
