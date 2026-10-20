import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createTransferDocuments } from './lib/transfer.mts';
import type { TransferResource } from './lib/transfer.mts';
import { buildPayload as buildSecompp1Payload, parseArgs as parseSecompp1Args } from './secompp-to-json.mts';
import { buildPayload as buildSecompp2Payload, parseArgs as parseSecompp2Args } from './secompp2-to-json.mts';

test('SECOMPP converters accept only SQL input and JSON output options', () => {
  assert.deepEqual(parseSecompp1Args([]), {
    input: 'import/secompp.sql',
    output: 'import/transfers/secompp',
    help: false,
  });
  assert.deepEqual(parseSecompp2Args([]), {
    input: 'import/secompp2.sql',
    output: 'import/transfers/secompp2',
    help: false,
  });
  assert.equal(parseSecompp1Args(['--output=tmp/one']).output, 'tmp/one');
  assert.equal(parseSecompp2Args(['--input', 'source.sql', '--output', 'tmp/two']).input, 'source.sql');
  assert.throws(() => parseSecompp1Args(['--database-url=postgresql://db/app']), /Unknown option/);
  assert.throws(() => parseSecompp2Args(['--dry-run']), /Unknown option/);
});

test('SECOMPP 1 writes supported transfer resources with stable catalog IDs and source person references', async () => {
  const sourceDate = daysFromNow(-14);
  const nextDate = daysFromNow(-13);
  const sql = [
    insert(
      'events',
      ['idEvent', 'name', 'start', 'end', 'location', 'link', 'description'],
      [[10, 'Evento', sourceDate, nextDate, 'Sala', null, '<b>Descrição</b>']],
    ),
    insert('lectures', ['idLecture', 'idEventFK', 'name', 'description'], [[2, 10, 'Palestra', '<p>Talk</p>']]),
    insert(
      'shortcourses',
      ['idShortcourse', 'idEventFK', 'name', 'description', 'workload', 'vacancies'],
      [[3, 10, 'Curso', '<p>Prática</p>', '2', '20']],
    ),
    insert('details', ['idDetail', 'cpf', 'name'], [[7, '123.456.789-01', 'ANA DA SILVA']]),
    insert('users', ['idUser', 'idDetailFK', 'email'], [[8, 7, ' ANA@EXAMPLE.COM ']]),
    insert('users_registered', ['id', 'idUserFK', 'idEventFK', 'amount', 'status'], [[101, 8, 10, '50.25', 'S']]),
    insert('users_registered_shortcourses', ['id', 'idUserFK', 'idShortcourseFK'], [[201, 8, 3]]),
    insert('presence_lectures', ['id', 'idUserFK', 'idLectureFK'], [[301, 8, 2]]),
    insert('presence_shortcourses', ['id', 'idUserFK', 'idShortcourseFK'], [[301, 8, 3]]),
    insert('users_lectures', ['id', 'idUserFK', 'idLectureFK'], [[401, 8, 2]]),
    insert('users_shortcourses', ['id', 'idUserFK', 'idShortcourseFK'], [[402, 8, 3]]),
  ].join('\n');
  const payload = await buildPayloadFromSql(sql, buildSecompp1Payload);
  const resources = payload.resources;
  const documentFiles = createTransferDocuments(resources);
  assert.equal(documentFiles.length, 4);
  assert.deepEqual(
    documentFiles.map((file) => file.resources[0]?.kind),
    ['major-event', 'major-event-subscription', 'event-subscription', 'event-attendance'],
  );
  assert.deepEqual(
    resources.map((resource) => resource.kind),
    [
      'major-event',
      'group',
      'group',
      'event',
      'event',
      'major-event-subscription',
      'event-subscription',
      'event-attendance',
      'event-attendance',
    ],
  );

  const majorEvent = requireResource(resources, 'major-event');
  const majorSubscription = requireResource(resources, 'major-event-subscription');
  const eventSubscription = requireResource(resources, 'event-subscription');
  const event = resources.find((resource) => resource.kind === 'event' && resource.data['type'] === 'MINICURSO');
  assert.equal(majorEvent.id, 'SYSCOMPP-1-major-event-10');
  assert.equal(majorEvent.data['isPaymentRequired'], true);
  assert.equal(majorSubscription.data['amountPaid'], 5025);
  assert.equal(majorSubscription.data['subscriptionStatus'], 'CONFIRMED');
  assert.deepEqual(majorSubscription.data['selectedEventIds'], ['SYSCOMPP-1-event-shortcourse-3']);
  assert.equal(majorSubscription.id, undefined);
  assert.equal(majorSubscription.key, 'SYSCOMPP-1-major-sub-101');
  assert.equal(eventSubscription.id, undefined);
  assert.equal(eventSubscription.key, 'SYSCOMPP-1-event-sub-201');
  assert.match(String(requireRecord(payload.report['notes'])['timestamps']), /interpreted as UTC/);
  assert.ok(event);
  assert.equal(event.data['onlineAttendanceCode'], undefined);
  assert.equal(event.data['eventGroupId'], 'SYSCOMPP-1-major-event-10-event-group-minicursos');
  const person = majorSubscription.data['person'];
  assert.deepEqual(person, {
    name: 'Ana da Silva',
    email: 'ana@example.com',
    identityDocument: '12345678901',
  });
  assert.equal('id' in requireRecord(person), false);
  assert.equal('userId' in requireRecord(person), false);
  assert.deepEqual(
    resources
      .filter((resource) => resource.kind === 'event-attendance')
      .map((resource) => resource.key)
      .sort(),
    ['SYSCOMPP-1-attendance-lecture-301', 'SYSCOMPP-1-attendance-shortcourse-301'],
  );
  assert.match(String(requireRecord(payload.report['notes'])['timestamps']), /interpreted as UTC/);
  assert.equal(payload.counts['unsupportedLecturerAssignments'], 2);
  assert.equal(requireRecord(payload.report['unsupported']).lecturerAssignments !== undefined, true);
});

test('SECOMPP 2 preserves source child selections and converts BRL payment amounts to centavos', async () => {
  const sourceDate = daysFromNow(-30);
  const sourceDateTime = `${sourceDate} 14:00:00`;
  const year = Number(sourceDate.slice(0, 4));
  const sql = [
    insert('ano_referencia', ['idAno_Referencia', 'ano', 'create_time'], [[4, year, null]]),
    insert('dados', ['CPF', 'nome', 'email'], [['98765432100', 'MARIA DA SILVA', 'maria@example.com']]),
    insert(
      'inscricao',
      ['idInscricao', 'CPFdadosFK', 'idAno_ReferenciaFK', 'total', 'status', 'create_time'],
      [[11, '98765432100', 4, '19.90', 1, sourceDateTime]],
    ),
    insert(
      'minicurso',
      [
        'idMinicurso',
        'idAno_ReferenciaFK',
        'data',
        'hora_inicio',
        'hora_termino',
        'nome',
        'descricao',
        'cargahoraria',
        'vagas',
        'local',
        'create_time',
      ],
      [
        [9, 4, sourceDate, '14:00', '16:30', 'Curso', null, 2, 10, 'Lab', sourceDateTime],
        [10, 4, sourceDate, '17:00', '18:00', 'Curso 2', null, 1, 10, 'Lab', sourceDateTime],
      ],
    ),
    insert(
      'palestra',
      [
        'idPalestra',
        'idAno_ReferenciaFK',
        'data',
        'hora_inicio',
        'hora_termino',
        'nome',
        'descricao',
        'local',
        'CPFusuarioFK',
        'create_time',
      ],
      [[5, 4, sourceDate, '09:00', '10:00', 'Talk', null, null, '98765432100', sourceDateTime]],
    ),
    insert(
      'participacao_minicurso',
      ['id', 'CPFusuarioFK', 'idMinicursoFK', 'presenca', 'create_time'],
      [
        [21, '98765432100', 9, 1, sourceDateTime],
        [22, '98765432100', 10, 0, sourceDateTime],
        [24, '11122233344', 9, 2, sourceDateTime],
      ],
    ),
    insert(
      'participacao_palestra',
      ['id', 'CPFusuarioFK', 'idPalestraFK', 'create_time'],
      [[21, '98765432100', 5, sourceDateTime]],
    ),
    insert(
      'ministrante_minicurso',
      ['id', 'CPFusuarioFK', 'idMinicursoFK', 'create_time'],
      [[31, '98765432100', 9, sourceDateTime]],
    ),
  ].join('\n');
  const payload = await buildPayloadFromSql(sql, buildSecompp2Payload);
  createTransferDocuments(payload.resources);

  const majorEvent = requireResource(payload.resources, 'major-event');
  const majorSubscription = requireResource(payload.resources, 'major-event-subscription');
  const course = payload.resources.find((resource) => resource.id === 'SYSCOMP-2-event-minicurso-9');
  const presentAttendance = payload.resources.find(
    (resource) => resource.kind === 'event-attendance' && resource.data['eventId'] === 'SYSCOMP-2-event-minicurso-9',
  );
  const absentAttendance = payload.resources.find(
    (resource) => resource.kind === 'event-attendance' && resource.data['eventId'] === 'SYSCOMP-2-event-minicurso-10',
  );
  assert.equal(majorEvent.id, 'SYSCOMP-2-major-event-ano-4');
  assert.equal(majorSubscription.data['amountPaid'], 1990);
  assert.equal(majorSubscription.data['paymentDate'], `${sourceDate}T14:00:00.000Z`);
  assert.deepEqual(majorSubscription.data['selectedEventIds'], [
    'SYSCOMP-2-event-minicurso-10',
    'SYSCOMP-2-event-minicurso-9',
    'SYSCOMP-2-event-palestra-5',
  ]);
  assert.equal(majorSubscription.key, 'SYSCOMP-2-major-sub-11');
  assert.equal(course?.data['startDate'], `${sourceDate}T14:00:00.000Z`);
  assert.equal(course?.data['endDate'], `${sourceDate}T16:30:00.000Z`);
  assert.ok(presentAttendance);
  assert.ok(absentAttendance);
  assert.equal(presentAttendance.key, 'SYSCOMP-2-attendance-minicurso-21');
  assert.equal(presentAttendance.data['attendedAt'], `${sourceDate}T14:00:00.000Z`);
  assert.equal(presentAttendance.data['status'], 'PRESENT');
  assert.equal(absentAttendance.key, 'SYSCOMP-2-attendance-minicurso-22');
  assert.equal(absentAttendance.data['status'], 'ABSENT');
  assert.deepEqual(absentAttendance.data['person'], presentAttendance.data['person']);
  assert.equal('id' in requireRecord(presentAttendance.data['person']), false);
  const eventSubscriptionKeys = payload.resources
    .filter((resource) => resource.kind === 'event-subscription')
    .map((resource) => resource.key);
  assert.ok(eventSubscriptionKeys.includes('SYSCOMP-2-event-sub-minicurso-21'));
  assert.ok(eventSubscriptionKeys.includes('SYSCOMP-2-event-sub-palestra-21'));
  const placeholder = payload.resources.find(
    (resource) =>
      resource.kind === 'event-subscription' &&
      requireRecord(resource.data['person'])['identityDocument'] === '11122233344',
  );
  assert.ok(placeholder);
  assert.deepEqual(placeholder.data['person'], { identityDocument: '11122233344' });
  assert.equal(payload.counts['peopleWithoutNames'], 1);
  assert.equal(payload.counts['unknownAttendanceStates'], 1);
  assert.equal(requireRecord(payload.report['unsupported']).unknownAttendanceStates !== undefined, true);
  assert.match(String(requireRecord(payload.report['notes'])['timestamps']), /interpreted as UTC/);
  assert.equal(payload.counts['unsupportedLecturerAssignments'], 2);
});

test('both SECOMPP catalogs keep groups and their events under the same major event across editions', async () => {
  const sourceDate = daysFromNow(-30);
  const year = Number(sourceDate.slice(0, 4));
  const first = await buildPayloadFromSql(
    [
      insert(
        'events',
        ['idEvent', 'name', 'start', 'end'],
        [
          [10, 'Primeira edição', sourceDate, sourceDate],
          [20, 'Segunda edição', sourceDate, sourceDate],
        ],
      ),
      insert(
        'lectures',
        ['idLecture', 'idEventFK', 'name'],
        [
          [1, 10, 'Palestra da primeira edição'],
          [2, 20, 'Palestra da segunda edição'],
        ],
      ),
    ].join('\n'),
    buildSecompp1Payload,
  );
  const second = await buildPayloadFromSql(
    [
      insert(
        'ano_referencia',
        ['idAno_Referencia', 'ano'],
        [
          [1, year - 1],
          [2, year],
        ],
      ),
      insert(
        'palestra',
        ['idPalestra', 'idAno_ReferenciaFK', 'data', 'hora_inicio', 'hora_termino', 'nome'],
        [
          [1, 1, sourceDate, '09:00', '10:00', 'Palestra da primeira edição'],
          [2, 2, sourceDate, '09:00', '10:00', 'Palestra da segunda edição'],
        ],
      ),
    ].join('\n'),
    buildSecompp2Payload,
  );

  for (const payload of [first, second]) {
    createTransferDocuments(payload.resources);
    const groups = new Map(payload.resources.filter((row) => row.kind === 'group').map((row) => [row.id, row]));
    const events = payload.resources.filter((row) => row.kind === 'event');
    assert.equal(events.length, 2);
    assert.equal(new Set(events.map((event) => event.data['eventGroupId'])).size, 2);
    for (const event of events) {
      const group = groups.get(String(event.data['eventGroupId']));
      assert.ok(group);
      assert.equal(group.data['majorEventId'], event.data['majorEventId']);
      assert.ok(payload.resources.some((row) => row.kind === 'major-event' && row.id === group.data['majorEventId']));
    }
  }
});

function requireResource(resources: readonly TransferResource[], kind: string): TransferResource {
  const resource = resources.find((item) => item.kind === kind);
  assert.ok(resource, `Expected ${kind} resource`);
  return resource;
}

function requireRecord(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

async function buildPayloadFromSql<T>(sql: string, build: (path: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'secompp-json-'));
  const path = join(directory, 'dump.sql');
  await writeFile(path, sql, 'utf8');
  try {
    return await build(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function insert(
  table: string,
  columns: readonly string[],
  rows: readonly (readonly (string | number | null)[])[],
): string {
  if (rows.length === 0) {
    throw new Error(`Expected fixture rows for ${table}.`);
  }
  const fields = columns.map((column) => `\`${column}\``).join(',');
  const values = rows.map((row) => `(${row.map(sqlLiteral).join(',')})`).join(',');
  return `INSERT INTO \`${table}\` (${fields}) VALUES ${values};`;
}

function sqlLiteral(value: string | number | null): string {
  if (value === null) {
    return 'NULL';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

function daysFromNow(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
