import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import {
  defaultSourceSchema,
  readEvcompSnapshot,
  validateRegistrationModalities,
  validateSourceSchema,
} from './source-adapter.mjs';
import { parseEvcompSqlDump } from './sql-dump-adapter.mjs';

test('source schema validation reports the exact drifted mapping', async () => {
  const connection = {
    async query() {
      return [[{ tableName: 'usuário', columnName: 'idUsuário' }]];
    },
  };
  await assert.rejects(
    validateSourceSchema(connection, defaultSourceSchema),
    /EvComp source schema drift detected; update sourceSchema for: users.nome_completo \(usuário\)/,
  );
});

test('reads standard extended MySQL dump inserts without a live database', () => {
  const sql = `
    -- Standard mysqldump-style CREATE statements establish column order.
    CREATE TABLE \`usuário\` (
      \`idUsuário\` int NOT NULL,
      \`nome_completo\` varchar(100) NOT NULL,
      \`email\` varchar(100),
      \`ra\` char(9),
      \`tipo_usuario\` char(3)
    ) ENGINE=InnoDB;
    INSERT INTO \`usuário\` VALUES
      (1,'Ana D\\'Ávila','ANA@example.com','001234567','PAR'),
      (2,'Sem vínculo','unused@example.com',NULL,'PAR');
    CREATE TABLE \`inscrição\` (
      \`idInscrição\` int, \`idEvento\` int, \`idUsuário\` int,
      \`data_inscricao\` datetime, \`status\` tinyint
    );
    INSERT INTO \`inscrição\` VALUES (10,20,1,'2026-08-16 15:00:00',1);
    CREATE TABLE \`inscrição_atividade\` (\`idInscrição\` int, \`idAtividade\` int);
    INSERT INTO \`inscrição_atividade\` VALUES (10,30),(10,31);
    CREATE TABLE \`presença\` (
      \`idPresença\` int, \`idAtividade\` int, \`idUsuário\` int,
      \`data_registro\` datetime, \`presente\` tinyint
    );
    INSERT INTO \`presença\` VALUES (40,30,1,'2026-08-16 16:00:00',1);
    CREATE TABLE \`ministrante_atividade\` (\`idUsuário\` int, \`idAtividade\` int);
    INSERT INTO \`ministrante_atividade\` VALUES (1,31);
    CREATE TABLE \`comprovante_blob\` (\`conteudo\` blob);
    INSERT INTO \`comprovante_blob\` VALUES (0xDEADBEEF);
  `;
  const snapshot = parseEvcompSqlDump(sql);
  assert.equal(snapshot.people.length, 1);
  assert.deepEqual(snapshot.events, []);
  assert.deepEqual(snapshot.activities, []);
  assert.deepEqual(snapshot.modalities, []);
  assert.equal(snapshot.people[0].name, "Ana D'Ávila");
  assert.deepEqual(
    snapshot.registrations.map((item) => item.sourceActivityId),
    [30, 31],
  );
  assert.equal(snapshot.registrations[0].createdAt.toISOString(), '2026-08-16T18:00:00.000Z');
  assert.equal(snapshot.attendances[0].recordedAt.toISOString(), '2026-08-16T19:00:00.000Z');
  assert.equal(snapshot.lecturers.length, 1);
});

test('preserves the selected modality, historical amount, and owning event', (t) => {
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-08-16T00:00:00.000Z') });
  t.after(() => mock.timers.reset());
  const sql = `
    CREATE TABLE \`usuário\` (
      \`idUsuário\` int, \`nome_completo\` varchar(50), \`email\` varchar(100),
      \`ra\` char(9), \`tipo_usuario\` char(3)
    );
    INSERT INTO \`usuário\` VALUES (1,'Ana','ana@example.com','123','PAR');
    CREATE TABLE \`evento\` (
      \`idEvento\` int, \`titulo\` varchar(155), \`descricao\` text,
      \`data_inicio\` date, \`data_termino\` date, \`data_inicio_inscricao\` date,
      \`data_fim_inscricao\` date, \`link\` varchar(255)
    );
    INSERT INTO \`evento\` VALUES
      (20,'Evento de teste','Descrição do evento','2026-08-16','2026-08-18','2026-08-01','2026-08-15',NULL);
    CREATE TABLE \`atividade\` (
      \`idAtividade\` int, \`idEvento\` int, \`titulo\` varchar(155), \`descricao\` text,
      \`local\` varchar(100), \`data_inicio\` date, \`data_termino\` date,
      \`hora_inicio\` time, \`hora_termino\` time, \`max_participantes\` int,
      \`carga_horaria_total\` int, \`carga_horaria_ministrante\` int
    );
    INSERT INTO \`atividade\` VALUES
      (30,20,'Atividade de teste','Descrição da atividade','Sala 1','2026-08-16','2026-08-16','08:00:00','12:30:00',40,4,2);
    CREATE TABLE \`modalidade_inscricao\` (
      \`idModalidadeInscricao\` int, \`idEvento\` int, \`nome\` varchar(100), \`valor\` decimal(10,2)
    );
    INSERT INTO \`modalidade_inscricao\` VALUES (7,20,'Com camiseta',50.00);
    CREATE TABLE \`inscrição\` (
      \`idInscrição\` int, \`idEvento\` int, \`idUsuário\` int, \`idModalidade\` int,
      \`data_inscricao\` datetime, \`status\` tinyint, \`valor_aplicado\` decimal(10,2)
    );
    INSERT INTO \`inscrição\` VALUES (10,20,1,7,'2026-08-16 15:00:00',1,50.00);
    CREATE TABLE \`inscrição_atividade\` (\`idInscrição\` int, \`idAtividade\` int);
    INSERT INTO \`inscrição_atividade\` VALUES (10,30);
    CREATE TABLE \`presença\` (
      \`idPresença\` int, \`idAtividade\` int, \`idUsuário\` int,
      \`data_registro\` datetime, \`presente\` tinyint
    );
    CREATE TABLE \`ministrante_atividade\` (\`idUsuário\` int, \`idAtividade\` int);
  `;
  const snapshot = parseEvcompSqlDump(sql);
  assert.deepEqual(
    snapshot.events.map(({ sourceId, name, startDate, endDate, subscriptionStartDate, subscriptionEndDate, link }) => ({
      sourceId,
      name,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      subscriptionStartDate: subscriptionStartDate.toISOString(),
      subscriptionEndDate: subscriptionEndDate.toISOString(),
      link,
    })),
    [
      {
        sourceId: 20,
        name: 'Evento de teste',
        startDate: '2026-08-16T03:00:00.000Z',
        endDate: '2026-08-19T02:59:59.999Z',
        subscriptionStartDate: '2026-08-01T03:00:00.000Z',
        subscriptionEndDate: '2026-08-16T02:59:59.999Z',
        link: null,
      },
    ],
  );
  assert.deepEqual(
    snapshot.activities.map(
      ({
        sourceId,
        sourceEventId,
        name,
        startDate,
        endDate,
        location,
        slots,
        durationInMinutes,
        lecturerDurationInMinutes,
      }) => ({
        sourceId,
        sourceEventId,
        name,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        location,
        slots,
        durationInMinutes,
        lecturerDurationInMinutes,
      }),
    ),
    [
      {
        sourceId: 30,
        sourceEventId: 20,
        name: 'Atividade de teste',
        startDate: '2026-08-16T11:00:00.000Z',
        endDate: '2026-08-16T15:30:00.000Z',
        location: 'Sala 1',
        slots: 40,
        durationInMinutes: 240,
        lecturerDurationInMinutes: 120,
      },
    ],
  );
  assert.deepEqual(snapshot.modalities, [{ sourceId: 7, sourceEventId: 20, name: 'Com camiseta', amount: 50 }]);
  assert.deepEqual(
    snapshot.registrations.map(({ sourceModalityId, sourceModalityEventId, modalityName, appliedAmount }) => ({
      sourceModalityId,
      sourceModalityEventId,
      modalityName,
      appliedAmount,
    })),
    [
      {
        sourceModalityId: 7,
        sourceModalityEventId: 20,
        modalityName: 'Com camiseta',
        appliedAmount: 50,
      },
    ],
  );
  const positiveOffset = parseEvcompSqlDump(sql, {}, '+05:30');
  assert.equal(positiveOffset.events[0].startDate.toISOString(), '2026-08-15T18:30:00.000Z');
  assert.equal(positiveOffset.events[0].endDate.toISOString(), '2026-08-18T18:29:59.999Z');
  assert.equal(positiveOffset.activities[0].startDate.toISOString(), '2026-08-16T02:30:00.000Z');
});

test('rejects a current registration whose modality belongs to another event', () => {
  const sql = `
    CREATE TABLE \`usuário\` (
      \`idUsuário\` int, \`nome_completo\` varchar(50), \`email\` varchar(100),
      \`ra\` char(9), \`tipo_usuario\` char(3)
    );
    CREATE TABLE \`modalidade_inscricao\` (
      \`idModalidadeInscricao\` int, \`idEvento\` int, \`nome\` varchar(100), \`valor\` decimal(10,2)
    );
    INSERT INTO \`modalidade_inscricao\` VALUES (7,99,'Wrong event',50.00);
    CREATE TABLE \`inscrição\` (
      \`idInscrição\` int, \`idEvento\` int, \`idUsuário\` int, \`idModalidade\` int,
      \`data_inscricao\` datetime, \`status\` tinyint, \`valor_aplicado\` decimal(10,2)
    );
    INSERT INTO \`inscrição\` VALUES (10,20,1,7,'2026-08-16 15:00:00',1,50.00);
    CREATE TABLE \`inscrição_atividade\` (\`idInscrição\` int, \`idAtividade\` int);
    CREATE TABLE \`presença\` (
      \`idPresença\` int, \`idAtividade\` int, \`idUsuário\` int,
      \`data_registro\` datetime, \`presente\` tinyint
    );
    CREATE TABLE \`ministrante_atividade\` (\`idUsuário\` int, \`idAtividade\` int);
  `;
  assert.throws(() => parseEvcompSqlDump(sql), /EvComp registration 10 modality 7 belongs to event 99, not 20/);
});

test('does not downgrade a dump with a present but incomplete modality table to legacy mode', () => {
  const sql = 'CREATE TABLE `modalidade_inscricao` (`idModalidadeInscricao` int);';
  assert.throws(
    () => parseEvcompSqlDump(sql),
    /EvComp SQL dump schema drift detected; update sourceSchema for: registrations\.idModalidade/,
  );
});

test('rejects a current registration whose modality row is missing', () => {
  assert.throws(
    () =>
      validateRegistrationModalities([
        {
          sourceId: 10,
          sourceEventId: 20,
          sourceModalityId: 7,
          sourceModalityEventId: null,
          modalityName: null,
          appliedAmount: 50,
        },
      ]),
    /EvComp registration 10 references missing modality 7/,
  );
});

test('does not downgrade a dump with a present but incomplete event or activity catalog to legacy mode', () => {
  assert.throws(
    () => parseEvcompSqlDump('CREATE TABLE `evento` (`idEvento` int);'),
    /EvComp SQL dump schema drift detected; update sourceSchema for: events\.titulo/,
  );
  assert.throws(() => parseEvcompSqlDump('CREATE TABLE `atividade` (`idAtividade` int);'), /activities\.idEvento/);
});

test('reads current modality columns from the live adapter query', async () => {
  const availableRows = Object.entries(defaultSourceSchema).flatMap(([, section]) =>
    Object.entries(section)
      .filter(([fieldName]) => fieldName !== 'table' && fieldName !== 'includedTypes')
      .map(([, column]) => ({ tableName: section.table, columnName: column })),
  );
  const calls = [];
  const connection = {
    async query(sql) {
      calls.push(sql);
      if (sql.includes('information_schema.COLUMNS')) return [availableRows];
      if (sql.includes('FROM `evento`')) {
        return [
          [
            {
              sourceId: 20,
              name: 'Evento de teste',
              description: 'Descrição do evento',
              startDate: '2026-08-16',
              endDate: '2026-08-18',
              subscriptionStartDate: '2026-08-01',
              subscriptionEndDate: '2026-08-15',
              link: null,
            },
          ],
        ];
      }
      if (sql.includes('FROM `atividade`')) {
        return [
          [
            {
              sourceId: 30,
              sourceEventId: 20,
              name: 'Atividade de teste',
              description: 'Descrição da atividade',
              location: 'Sala 1',
              startDate: '2026-08-16',
              endDate: '2026-08-16',
              startTime: '08:00:00',
              endTime: '12:30:00',
              slots: 40,
              durationHours: 4,
              lecturerDurationHours: 2,
            },
          ],
        ];
      }
      if (sql.includes('FROM `modalidade_inscricao`')) {
        return [[{ sourceId: 7, sourceEventId: 20, name: 'Com camiseta', amount: '50.00' }]];
      }
      if (sql.includes('FROM `inscrição`')) {
        return [
          [
            {
              sourceId: 10,
              sourcePersonId: 1,
              sourceEventId: 20,
              sourceModalityId: 7,
              sourceModalityEventId: 20,
              modalityName: 'Com camiseta',
              appliedAmount: '50.00',
              createdAt: new Date('2026-08-16T18:00:00.000Z'),
              active: 1,
              sourceActivityId: 30,
            },
          ],
        ];
      }
      if (sql.includes('FROM `presença`')) return [[]];
      if (sql.includes('FROM `ministrante_atividade`')) return [[]];
      if (sql.includes('FROM `usuário`'))
        return [[{ sourceId: 1, name: 'Ana', email: 'ana@example.com', academicId: '123' }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  };
  const snapshot = await readEvcompSnapshot(connection);
  assert.equal(snapshot.registrations[0].sourceModalityId, 7);
  assert.equal(snapshot.registrations[0].sourceModalityEventId, 20);
  assert.equal(snapshot.registrations[0].appliedAmount, '50.00');
  assert.equal(snapshot.events[0].startDate.toISOString(), '2026-08-16T03:00:00.000Z');
  assert.equal(snapshot.events[0].endDate.toISOString(), '2026-08-19T02:59:59.999Z');
  assert.equal(snapshot.activities[0].startDate.toISOString(), '2026-08-16T11:00:00.000Z');
  assert.equal(snapshot.activities[0].durationInMinutes, 240);
  assert.deepEqual(snapshot.modalities, [{ sourceId: 7, sourceEventId: 20, name: 'Com camiseta', amount: '50.00' }]);
  assert.ok(calls.some((sql) => sql.includes('LEFT JOIN `modalidade_inscricao`')));
});

test('SQL dump mode reports configured schema drift before importing', () => {
  assert.throws(
    () => parseEvcompSqlDump('CREATE TABLE `usuário` (`idUsuário` int);'),
    /EvComp SQL dump schema drift detected/,
  );
});
