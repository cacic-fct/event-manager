import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  buildParticipationResourcesForCsv,
  findNameColumn,
  iterInputCsvPaths,
  parseArgs,
  readPeopleLookup,
  runCrossCsv,
} from './cross-csv-to-json.mts';
import { dedupeParticipationResources } from './lib/participation.mts';
import { createTransferDocuments } from './lib/transfer.mts';

test('finds explicit and default name columns after normalization', () => {
  assert.equal(findNameColumn(['Data', 'Nome completo'], ''), 'Nome completo');
  assert.equal(findNameColumn(['Data', 'FULL NAME'], 'full name'), 'FULL NAME');
  assert.throws(() => findNameColumn(['Data'], ''), /Could not detect/);
});

test('merges compatible partial people rows with first non-empty values', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const path = join(directory, 'people.csv');
    await writeFile(
      path,
      'fullName,email,enrollmentNumber,identityDocument\r\nJoão da Silva,,123,CPF-1\r\nJOAO DA SILVA,joao@example.com,123,CPF-1\r\n',
    );
    const result = await readPeopleLookup(path);
    assert.equal(result.collisions, 0);
    assert.deepEqual(result.lookup.get('joao da silva'), {
      fullName: 'João da Silva',
      email: 'joao@example.com',
      enrollmentNumber: '123',
      identityDocument: 'CPF-1',
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('drops ambiguous people matches and keeps the input name for transfer review', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const peoplePath = join(directory, 'people.csv');
    const inputPath = join(directory, 'input.csv');
    await writeFile(
      peoplePath,
      'fullName,email,enrollmentNumber,identityDocument\nJoão,one@example.com,RA-1,CPF-1\nJOAO,two@example.com,RA-2,CPF-2\n',
    );
    await writeFile(inputPath, 'name\nJoão\nJOAO\n');
    const people = await readPeopleLookup(peoplePath);
    assert.equal(people.collisions, 1);
    assert.equal(people.lookup.has('joao'), false);

    const result = await buildParticipationResourcesForCsv({
      inputCsvPath: inputPath,
      inputDir: directory,
      targetKind: 'event-subscription',
      targetId: 'event-1',
      peopleLookup: people.lookup,
    });
    assert.equal(result.rowsUnmatched, 2);
    assert.deepEqual(
      result.resources.map((resource) => resource.data),
      [
        { eventId: 'event-1', person: { name: 'João' } },
        { eventId: 'event-1', person: { name: 'JOAO' } },
      ],
    );
    assert.throws(
      () => dedupeParticipationResources(result.resources, people.ambiguousNameKeys),
      /Repeated participation rows for ambiguous person.*Resolve the person identifiers or remove the duplicate source rows/,
    );
    assert.equal(createTransferDocuments(result.resources.slice(0, 1))[0]?.resources.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('builds schema-valid participation references with matched enrichment', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const peoplePath = join(directory, 'people.csv');
    const inputPath = join(directory, 'input.csv');
    await writeFile(peoplePath, 'fullName,email,enrollmentNumber,identityDocument\nAna,ana@example.com,RA-1,CPF-1\n');
    await writeFile(inputPath, 'Nome completo,Observação\n  ANA  ,"a, note"\nOutra,\n,\n');
    const { lookup } = await readPeopleLookup(peoplePath);
    const result = await buildParticipationResourcesForCsv({
      inputCsvPath: inputPath,
      inputDir: directory,
      targetKind: 'event-subscription',
      targetId: 'event-1',
      peopleLookup: lookup,
    });

    assert.equal(result.rowsTotal, 3);
    assert.equal(result.rowsMatched, 1);
    assert.equal(result.rowsUnmatched, 1);
    assert.equal(result.rowsSkippedWithoutName, 1);
    assert.deepEqual(
      result.resources.map((resource) => resource.data),
      [
        {
          eventId: 'event-1',
          person: { name: 'Ana', email: 'ana@example.com', academicId: 'RA-1', identityDocument: 'CPF-1' },
        },
        { eventId: 'event-1', person: { name: 'Outra' } },
      ],
    );
    assert.equal(createTransferDocuments(result.resources)[0]?.resources.length, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('requires a participation target and rejects removed enrichment CSV options', () => {
  assert.throws(() => parseArgs(['--input-dir', 'source']), /--people-csv is required/);
  assert.throws(
    () => parseArgs(['--input-dir', 'source', '--people-csv', 'people.csv', '--target-kind', 'event-subscription']),
    /--target-id is required/,
  );
  assert.throws(
    () =>
      parseArgs([
        '--input-dir',
        'source',
        '--people-csv',
        'people.csv',
        '--target-kind',
        'event-subscription',
        '--target-id',
        'event-1',
        '--output-suffix',
        '_crossed',
      ]),
    /Unknown argument/,
  );

  const args = parseArgs([
    '--input-dir',
    'source',
    '--people-csv',
    'people.csv',
    '--target-kind',
    'group-subscription',
    '--target-id',
    'group-1',
  ]);
  assert.equal(args.targetKind, 'group-subscription');
  assert.equal(args.targetId, 'group-1');
  assert.equal(args.outputDir, 'import/transfers/cross-csv');
  assert.equal(
    parseArgs([
      '--input-dir',
      'source',
      '--people-csv',
      'people.csv',
      '--target-kind',
      'event-subscription',
      '--target-id',
      'event-1',
      '--output',
      'tmp/transfer',
    ]).outputDir,
    'tmp/transfer',
  );
});

test('writes JSON transfer files and excludes the recursive output directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const inputDir = join(directory, 'input');
    const peoplePath = join(directory, 'people.csv');
    const outputDir = join(inputDir, 'output');
    const nested = join(inputDir, 'nested');
    await mkdir(nested, { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(peoplePath, 'fullName,email,enrollmentNumber,identityDocument\nAna,ana@example.com,RA-1,CPF-1\n');
    await writeFile(join(inputDir, 'one.csv'), 'name\nAna\n');
    await writeFile(join(nested, 'two.csv'), 'name\nAna\n');
    await writeFile(join(outputDir, 'old.csv'), 'name\nAna\n');
    assert.deepEqual(
      iterInputCsvPaths(inputDir, '*.csv', true, outputDir),
      [resolve(inputDir, 'nested/two.csv'), resolve(inputDir, 'one.csv')].sort(),
    );
    await rm(outputDir, { recursive: true, force: true });

    const result = await runCrossCsv({
      peopleCsv: peoplePath,
      inputDir,
      outputDir,
      targetKind: 'event-subscription',
      targetId: 'event-1',
      glob: '*.csv',
      recursive: true,
      nameColumn: '',
      help: false,
    });
    assert.deepEqual(
      {
        processedFiles: result.processedFiles,
        resources: result.resources,
        duplicateResourcesRemoved: result.duplicateResourcesRemoved,
        sameNameReferenceGroups: result.sameNameReferenceGroups,
        rowsTotal: result.rowsTotal,
        rowsMatched: result.rowsMatched,
        rowsUnmatched: result.rowsUnmatched,
        rowsSkippedWithoutName: result.rowsSkippedWithoutName,
      },
      {
        processedFiles: 2,
        resources: 1,
        duplicateResourcesRemoved: 1,
        sameNameReferenceGroups: 0,
        rowsTotal: 2,
        rowsMatched: 2,
        rowsUnmatched: 0,
        rowsSkippedWithoutName: 0,
      },
    );
    const transfer = JSON.parse(await readFile(join(outputDir, '001-event-data.json'), 'utf8')) as {
      resources: Array<{ kind: string; data: Record<string, unknown> }>;
    };
    assert.equal(transfer.resources.length, 1);
    assert.ok(transfer.resources.every((resource) => resource.kind === 'event-subscription'));
    assert.ok(transfer.resources.every((resource) => resource.data.eventId === 'event-1'));
    const manifest = JSON.parse(await readFile(join(outputDir, 'manifest.json'), 'utf8')) as Record<string, unknown>;
    assert.equal(manifest.resources, 1);
    assert.equal(manifest.duplicateResourcesRemoved, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('fails before publishing repeated rows for an ambiguous lookup name', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fct-cross-'));
  try {
    const inputDir = join(directory, 'input');
    const outputDir = join(directory, 'output');
    await mkdir(inputDir, { recursive: true });
    const peoplePath = join(directory, 'people.csv');
    await writeFile(
      peoplePath,
      'fullName,email,enrollmentNumber,identityDocument\nJoão,one@example.com,RA-1,CPF-1\nJOAO,two@example.com,RA-2,CPF-2\n',
    );
    await writeFile(join(inputDir, 'members.csv'), 'name\nJoão\nJOAO\n');

    await assert.rejects(
      runCrossCsv({
        peopleCsv: peoplePath,
        inputDir,
        outputDir,
        targetKind: 'event-subscription',
        targetId: 'event-1',
        glob: '*.csv',
        recursive: false,
        nameColumn: '',
        help: false,
      }),
      /Repeated participation rows for ambiguous person.*Resolve the person identifiers or remove the duplicate source rows/,
    );
    await assert.rejects(access(outputDir), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
