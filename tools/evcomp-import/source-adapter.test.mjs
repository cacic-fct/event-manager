import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultSourceSchema, validateSourceSchema } from './source-adapter.mjs';
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
  assert.equal(snapshot.people[0].name, "Ana D'Ávila");
  assert.deepEqual(snapshot.registrations.map((item) => item.sourceActivityId), [30, 31]);
  assert.equal(snapshot.registrations[0].createdAt.toISOString(), '2026-08-16T18:00:00.000Z');
  assert.equal(snapshot.attendances[0].recordedAt.toISOString(), '2026-08-16T19:00:00.000Z');
  assert.equal(snapshot.lecturers.length, 1);
});

test('SQL dump mode reports configured schema drift before importing', () => {
  assert.throws(
    () => parseEvcompSqlDump('CREATE TABLE `usuário` (`idUsuário` int);'),
    /EvComp SQL dump schema drift detected/,
  );
});
