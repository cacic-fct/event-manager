import { quoteMysqlIdentifier as q } from './core.mjs';

export const defaultSourceSchema = {
  users: {
    table: 'usuário',
    id: 'idUsuário',
    name: 'nome_completo',
    email: 'email',
    academicId: 'ra',
    type: 'tipo_usuario',
    includedTypes: ['PAR', 'COL', 'ADM'],
  },
  registrations: {
    table: 'inscrição',
    id: 'idInscrição',
    userId: 'idUsuário',
    eventId: 'idEvento',
    createdAt: 'data_inscricao',
    active: 'status',
  },
  registrationActivities: {
    table: 'inscrição_atividade',
    registrationId: 'idInscrição',
    activityId: 'idAtividade',
  },
  attendances: {
    table: 'presença',
    id: 'idPresença',
    userId: 'idUsuário',
    activityId: 'idAtividade',
    recordedAt: 'data_registro',
    present: 'presente',
  },
  lecturers: {
    table: 'ministrante_atividade',
    userId: 'idUsuário',
    activityId: 'idAtividade',
  },
};

export async function readEvcompSnapshot(connection, override = {}) {
  const schema = mergeSchema(defaultSourceSchema, override);
  await validateSourceSchema(connection, schema);
  const registrations = await rows(connection, registrationsSql(schema));
  const attendances = await rows(connection, attendancesSql(schema));
  const lecturers = await rows(connection, lecturersSql(schema));
  const referencedPersonIds = new Set(
    [...registrations, ...attendances, ...lecturers].map((row) => String(row.sourcePersonId)),
  );
  const people = (await rows(connection, peopleSql(schema), [schema.users.includedTypes])).filter((person) =>
    referencedPersonIds.has(String(person.sourceId)),
  );
  return { people, registrations, attendances, lecturers };
}

export async function validateSourceSchema(connection, schema) {
  const required = [];
  for (const [sectionName, section] of Object.entries(schema)) {
    for (const [fieldName, column] of Object.entries(section)) {
      if (fieldName === 'table' || fieldName === 'includedTypes') continue;
      required.push({ sectionName, table: section.table, column });
    }
  }
  const tables = [...new Set(required.map((item) => item.table))];
  const [availableRows] = await connection.query(
    `SELECT TABLE_NAME tableName, COLUMN_NAME columnName FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN (?)`,
    [tables],
  );
  const available = new Set(availableRows.map((row) => `${row.tableName}\0${row.columnName}`));
  const missing = required.filter((item) => !available.has(`${item.table}\0${item.column}`));
  if (missing.length) {
    throw new Error(
      `EvComp source schema drift detected; update sourceSchema for: ${missing
        .map((item) => `${item.sectionName}.${item.column} (${item.table})`)
        .join(', ')}`,
    );
  }
}

export function mergeSchema(base, override) {
  return Object.fromEntries(
    Object.entries(base).map(([section, fields]) => [section, { ...fields, ...(override[section] ?? {}) }]),
  );
}

function peopleSql({ users: u }) {
  return `SELECT ${q(u.id)} sourceId, ${q(u.name)} name, ${q(u.email)} email, ${q(u.academicId)} academicId
    FROM ${q(u.table)} WHERE ${q(u.type)} IN (?)`;
}

function registrationsSql({ registrations: r, registrationActivities: ra }) {
  return `SELECT r.${q(r.id)} sourceId, r.${q(r.userId)} sourcePersonId,
      r.${q(r.eventId)} sourceEventId, r.${q(r.createdAt)} createdAt,
      r.${q(r.active)} active, ra.${q(ra.activityId)} sourceActivityId
    FROM ${q(r.table)} r
    LEFT JOIN ${q(ra.table)} ra ON ra.${q(ra.registrationId)} = r.${q(r.id)}`;
}

function attendancesSql({ attendances: a }) {
  return `SELECT ${q(a.id)} sourceId, ${q(a.userId)} sourcePersonId,
      ${q(a.activityId)} sourceActivityId, ${q(a.recordedAt)} recordedAt,
      ${q(a.present)} present FROM ${q(a.table)}`;
}

function lecturersSql({ lecturers: l }) {
  return `SELECT ${q(l.userId)} sourcePersonId, ${q(l.activityId)} sourceActivityId
    FROM ${q(l.table)}`;
}

async function rows(connection, sql, parameters = []) {
  const [result] = await connection.query(sql, parameters);
  return result;
}
