import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { writeTransferFiles } from './transfer-files.mjs';
import { loadTransferContract } from './transfer-validation.mjs';
import { defaultSourceSchema } from './source-adapter.mjs';

const projectDirectory = fileURLToPath(new URL('../../', import.meta.url));
const document = {
  format: 'cacic-event-data',
  version: 1,
  resources: [{ kind: 'major-event', id: 'existing-or-new-id', data: { name: 'Evento' } }],
};

async function temporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), 'evcomp-transfer-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('writes private import files, the current schema and an ordered manifest', async (t) => {
  const parent = await temporaryDirectory(t);
  const destination = join(parent, 'export');
  const result = await writeTransferFiles(destination, {
    documents: [{ name: '001-catalog.json', document }],
    report: { sourceNamespace: 'test', omitted: ['lecturers'] },
  });
  assert.equal(result.directory, destination);
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'));
  assert.equal(manifest.sourceNamespace, 'test');
  assert.ok(manifest.instructions.some((instruction) => instruction.includes('create missing people')));
  assert.ok(manifest.instructions.some((instruction) => instruction.includes('Person.Create')));
  assert.equal(
    manifest.instructions.some((instruction) => instruction.includes('People must already exist')),
    false,
  );
  assert.equal(manifest.files[0].name, '001-catalog.json');
  assert.equal(manifest.files[0].resources, 1);
  const dataText = await readFile(join(destination, '001-catalog.json'), 'utf8');
  assert.equal(manifest.files[0].bytes, Buffer.byteLength(dataText));
  assert.deepEqual(loadTransferContract().parseTransferJson(dataText), document);
  assert.deepEqual(
    JSON.parse(await readFile(join(destination, 'event-data.schema.json'), 'utf8')),
    JSON.parse(JSON.stringify(loadTransferContract().TransferDocumentSchema)),
  );
  assert.equal((await stat(destination)).mode & 0o777, 0o700);
  for (const name of await readdir(destination)) {
    assert.equal((await stat(join(destination, name))).mode & 0o777, 0o600);
  }
});

test('refuses to replace an existing export and removes temporary files', async (t) => {
  const parent = await temporaryDirectory(t);
  const destination = join(parent, 'export');
  await mkdir(destination);
  await writeFile(join(destination, 'keep.txt'), 'previous export');
  await assert.rejects(writeTransferFiles(destination, { documents: [{ name: '001.json', document }], report: {} }), {
    code: 'EEXIST',
  });
  assert.deepEqual(await readdir(parent), ['export']);
  assert.equal(await readFile(join(destination, 'keep.txt'), 'utf8'), 'previous export');
});

test('validates documents and output names before creating any files', async (t) => {
  const parent = await temporaryDirectory(t);
  for (const name of ['../outside.json', '/absolute.json', 'manifest.json', 'event-data.schema.json']) {
    await assert.rejects(
      writeTransferFiles(join(parent, 'export'), { documents: [{ name, document }], report: {} }),
      /unique JSON basenames/,
    );
  }
  await assert.rejects(
    writeTransferFiles(join(parent, 'export'), {
      documents: [{ name: '001.json', document: { ...document, resources: [] } }],
      report: {},
    }),
    /Estrutura incompatível/,
  );
  assert.deepEqual(await readdir(parent), []);
});

test('JSON CLI validates incompatible arguments without requiring a database', () => {
  for (const args of [
    ['--export-json'],
    ['--export-json', 'unused', '--apply'],
    ['--export-json', 'unused', '--report', 'unused'],
  ]) {
    const result = spawnSync(process.execPath, ['tools/evcomp-import/index.mjs', ...args], {
      cwd: projectDirectory,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--export-json requires a value|--apply has been removed|--report has been removed/);
    assert.doesNotMatch(result.stderr, /DATABASE_URL/);
  }
});

test('JSON CLI exports a SQL dump from another working directory with no target URL', async (t) => {
  const parent = await temporaryDirectory(t);
  const dump = join(parent, 'source.sql');
  const destination = join(parent, 'output');
  const now = new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = now.toISOString().slice(0, 10);
  const tables = Object.values(defaultSourceSchema).map((section) => {
    const columns = Object.entries(section)
      .filter(([key]) => key !== 'table' && key !== 'includedTypes')
      .map(([, column]) => `\`${column}\` text`);
    return `CREATE TABLE \`${section.table}\` (${columns.join(',')});`;
  });
  await writeFile(
    dump,
    [
      ...tables,
      `INSERT INTO evento (idEvento,titulo,data_inicio,data_termino) VALUES (1,'Evento','${start}','${end}');`,
    ].join('\n'),
  );
  const result = spawnSync(
    process.execPath,
    [join(projectDirectory, 'tools/evcomp-import/index.mjs'), '--source-sql', dump, '--export-json', destination],
    {
      cwd: parent,
      encoding: 'utf8',
      env: { PATH: process.env.PATH },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(destination, 'manifest.json'), 'utf8'));
  assert.equal(manifest.files.length, 1);
  const exported = loadTransferContract().parseTransferJson(
    await readFile(join(destination, manifest.files[0].name), 'utf8'),
  );
  assert.equal(exported.resources[0].kind, 'major-event');
  assert.equal(exported.resources[0].data.name, 'Evento');
});
