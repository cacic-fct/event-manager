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
  events: {
    table: 'evento',
    id: 'idEvento',
    name: 'titulo',
    description: 'descricao',
    startDate: 'data_inicio',
    endDate: 'data_termino',
    subscriptionStartDate: 'data_inicio_inscricao',
    subscriptionEndDate: 'data_fim_inscricao',
    link: 'link',
  },
  activities: {
    table: 'atividade',
    id: 'idAtividade',
    eventId: 'idEvento',
    name: 'titulo',
    description: 'descricao',
    location: 'local',
    startDate: 'data_inicio',
    endDate: 'data_termino',
    startTime: 'hora_inicio',
    endTime: 'hora_termino',
    slots: 'max_participantes',
    durationHours: 'carga_horaria_total',
    lecturerDurationHours: 'carga_horaria_ministrante',
  },
  modalities: {
    table: 'modalidade_inscricao',
    id: 'idModalidadeInscricao',
    eventId: 'idEvento',
    name: 'nome',
    amount: 'valor',
  },
  registrations: {
    table: 'inscrição',
    id: 'idInscrição',
    userId: 'idUsuário',
    eventId: 'idEvento',
    modalityId: 'idModalidade',
    createdAt: 'data_inscricao',
    active: 'status',
    appliedAmount: 'valor_aplicado',
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

export async function readEvcompSnapshot(connection, override = {}, timezoneOffset = '-03:00') {
  const schema = mergeSchema(defaultSourceSchema, override);
  const { catalogMode, modalityMode } = await validateSourceSchema(connection, schema);
  const effectiveSchema = schemaForModes(schema, { catalogMode, modalityMode });
  const events =
    catalogMode === 'current'
      ? (await rows(connection, eventsSql(effectiveSchema))).map((row) => normalizeEventRow(row, timezoneOffset))
      : [];
  const activities =
    catalogMode === 'current'
      ? (await rows(connection, activitiesSql(effectiveSchema))).map((row) => normalizeActivityRow(row, timezoneOffset))
      : [];
  const modalities =
    modalityMode === 'current'
      ? (await rows(connection, modalitiesSql(effectiveSchema))).map((row) => normalizeModalityRow(row))
      : [];
  const registrations = await rows(connection, registrationsSql(effectiveSchema));
  if (modalityMode === 'current') validateRegistrationModalities(registrations);
  const attendances = await rows(connection, attendancesSql(effectiveSchema));
  const lecturers = await rows(connection, lecturersSql(effectiveSchema));
  const referencedPersonIds = new Set(
    [...registrations, ...attendances, ...lecturers].map((row) => String(row.sourcePersonId)),
  );
  const people = (await rows(connection, peopleSql(effectiveSchema), [schema.users.includedTypes])).filter((person) =>
    referencedPersonIds.has(String(person.sourceId)),
  );
  return { people, events, activities, modalities, registrations, attendances, lecturers };
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
  const availableTables = new Set(availableRows.map((row) => row.tableName));
  const catalogRequirements = catalogRequirementsFor(schema);
  const catalogKeys = new Set(catalogRequirements.map((item) => `${item.table}\0${item.column}`));
  const presentCatalogRequirements = catalogRequirements.filter((item) =>
    available.has(`${item.table}\0${item.column}`),
  );
  const catalogFeaturePresent =
    presentCatalogRequirements.length > 0 || catalogRequirements.some((item) => availableTables.has(item.table));
  const catalogMode = !catalogFeaturePresent
    ? 'legacy'
    : presentCatalogRequirements.length === catalogRequirements.length
      ? 'current'
      : 'partial';
  const modalityRequirements = modalityRequirementsFor(schema);
  const modalityKeys = new Set(modalityRequirements.map((item) => `${item.table}\0${item.column}`));
  const presentModalityRequirements = modalityRequirements.filter((item) =>
    available.has(`${item.table}\0${item.column}`),
  );
  const modalityTable = schema.modalities?.table;
  const registrationModalityFields = modalityRequirements.filter((item) => item.sectionName === 'registrations');
  const registrationModalityFeaturePresent = registrationModalityFields.some((item) =>
    available.has(`${item.table}\0${item.column}`),
  );
  const modalityFeaturePresent = registrationModalityFeaturePresent || availableTables.has(modalityTable);
  const modalityMode = !modalityFeaturePresent
    ? 'legacy'
    : presentModalityRequirements.length === modalityRequirements.length
      ? 'current'
      : 'partial';
  const legacyKeys = new Set([
    ...(catalogMode === 'legacy' ? catalogKeys : []),
    ...(modalityMode === 'legacy' ? modalityKeys : []),
  ]);
  const requiredForValidation = required.filter((item) => !legacyKeys.has(`${item.table}\0${item.column}`));
  const missing = requiredForValidation.filter((item) => !available.has(`${item.table}\0${item.column}`));
  if (missing.length) {
    throw new Error(
      `EvComp source schema drift detected; update sourceSchema for: ${missing
        .map((item) => `${item.sectionName}.${item.column} (${item.table})`)
        .join(', ')}`,
    );
  }
  return { catalogMode, modalityMode };
}

export function mergeSchema(base, override) {
  return Object.fromEntries(
    Object.entries(base).map(([section, fields]) => [section, { ...fields, ...(override[section] ?? {}) }]),
  );
}

export function validateRegistrationModalities(registrations) {
  for (const registration of registrations) {
    const sourceId = String(registration.sourceId);
    if (registration.sourceModalityId == null) {
      throw new Error(`EvComp registration ${sourceId} references a missing modality.`);
    }
    if (registration.sourceModalityEventId == null) {
      throw new Error(
        `EvComp registration ${sourceId} references missing modality ${String(registration.sourceModalityId)}.`,
      );
    }
    if (!valuesEqual(registration.sourceModalityEventId, registration.sourceEventId)) {
      throw new Error(
        `EvComp registration ${sourceId} modality ${String(
          registration.sourceModalityId,
        )} belongs to event ${String(registration.sourceModalityEventId)}, not ${String(registration.sourceEventId)}.`,
      );
    }
    if (registration.modalityName == null) {
      throw new Error(`EvComp registration ${sourceId} references a modality without a name.`);
    }
    if (registration.appliedAmount == null) {
      throw new Error(`EvComp registration ${sourceId} has no applied amount.`);
    }
  }
}

export function normalizeEventRow(row, timezoneOffset = '-03:00') {
  return {
    sourceId: row.sourceId,
    name: row.name,
    description: row.description,
    startDate: parseSourceDate(row.startDate, timezoneOffset),
    endDate: parseSourceDate(row.endDate, timezoneOffset, true),
    subscriptionStartDate: parseSourceDate(row.subscriptionStartDate, timezoneOffset),
    subscriptionEndDate: parseSourceDate(row.subscriptionEndDate, timezoneOffset, true),
    link: row.link,
  };
}

export function normalizeActivityRow(row, timezoneOffset = '-03:00') {
  return {
    sourceId: row.sourceId,
    sourceEventId: row.sourceEventId,
    name: row.name,
    description: row.description,
    startDate: combineSourceDateTime(row.startDate, row.startTime, timezoneOffset),
    endDate: combineSourceDateTime(row.endDate, row.endTime, timezoneOffset),
    location: row.location,
    slots: toSourceInteger(row.slots, 'slots'),
    durationInMinutes: hoursToMinutes(row.durationHours, 'durationInMinutes'),
    lecturerDurationInMinutes: hoursToMinutes(row.lecturerDurationHours, 'lecturerDurationInMinutes'),
  };
}

export function normalizeModalityRow(row) {
  return {
    sourceId: row.sourceId,
    sourceEventId: row.sourceEventId,
    name: row.name,
    amount: row.amount,
  };
}

function peopleSql({ users: u }) {
  return `SELECT ${q(u.id)} sourceId, ${q(u.name)} name, ${q(u.email)} email, ${q(u.academicId)} academicId
    FROM ${q(u.table)} WHERE ${q(u.type)} IN (?)`;
}

function eventsSql({ events: e }) {
  return `SELECT ${q(e.id)} sourceId, ${q(e.name)} name, ${q(e.description)} description,
      DATE_FORMAT(${q(e.startDate)}, '%Y-%m-%d') startDate,
      DATE_FORMAT(${q(e.endDate)}, '%Y-%m-%d') endDate,
      DATE_FORMAT(${q(e.subscriptionStartDate)}, '%Y-%m-%d') subscriptionStartDate,
      DATE_FORMAT(${q(e.subscriptionEndDate)}, '%Y-%m-%d') subscriptionEndDate,
      ${q(e.link)} link FROM ${q(e.table)}`;
}

function activitiesSql({ activities: a }) {
  return `SELECT ${q(a.id)} sourceId, ${q(a.eventId)} sourceEventId, ${q(a.name)} name,
      ${q(a.description)} description, ${q(a.location)} location,
      DATE_FORMAT(${q(a.startDate)}, '%Y-%m-%d') startDate,
      DATE_FORMAT(${q(a.endDate)}, '%Y-%m-%d') endDate,
      TIME_FORMAT(${q(a.startTime)}, '%H:%i:%s') startTime,
      TIME_FORMAT(${q(a.endTime)}, '%H:%i:%s') endTime,
      ${q(a.slots)} slots, ${q(a.durationHours)} durationHours,
      ${q(a.lecturerDurationHours)} lecturerDurationHours
    FROM ${q(a.table)}`;
}

function modalitiesSql({ modalities: m }) {
  return `SELECT ${q(m.id)} sourceId, ${q(m.eventId)} sourceEventId,
      ${q(m.name)} name, ${q(m.amount)} amount FROM ${q(m.table)}`;
}

function registrationsSql({ registrations: r, registrationActivities: ra, modalities: m }) {
  const modalityColumns = m
    ? `, r.${q(r.modalityId)} sourceModalityId,
      m.${q(m.eventId)} sourceModalityEventId, m.${q(m.name)} modalityName,
      r.${q(r.appliedAmount)} appliedAmount`
    : '';
  const modalityJoin = m ? `\n    LEFT JOIN ${q(m.table)} m ON m.${q(m.id)} = r.${q(r.modalityId)}` : '';
  return `SELECT r.${q(r.id)} sourceId, r.${q(r.userId)} sourcePersonId,
      r.${q(r.eventId)} sourceEventId, r.${q(r.createdAt)} createdAt,
      r.${q(r.active)} active${modalityColumns}, ra.${q(ra.activityId)} sourceActivityId
    FROM ${q(r.table)} r
    LEFT JOIN ${q(ra.table)} ra ON ra.${q(ra.registrationId)} = r.${q(r.id)}${modalityJoin}`;
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

function modalityRequirementsFor(schema) {
  const requirements = [];
  const registrations = schema.registrations;
  const modalities = schema.modalities;
  if (!registrations || !modalities) return requirements;
  requirements.push(
    { sectionName: 'registrations', table: registrations.table, column: registrations.modalityId },
    { sectionName: 'registrations', table: registrations.table, column: registrations.appliedAmount },
    { sectionName: 'modalities', table: modalities.table, column: modalities.id },
    { sectionName: 'modalities', table: modalities.table, column: modalities.eventId },
    { sectionName: 'modalities', table: modalities.table, column: modalities.name },
    { sectionName: 'modalities', table: modalities.table, column: modalities.amount },
  );
  return requirements;
}

export function catalogRequirementsFor(schema) {
  return ['events', 'activities'].flatMap((sectionName) => {
    const section = schema[sectionName];
    if (!section) return [];
    return Object.entries(section)
      .filter(([fieldName]) => fieldName !== 'table')
      .map(([fieldName, column]) => ({ sectionName, fieldName, table: section.table, column }));
  });
}

export function schemaForModes(schema, { catalogMode, modalityMode }) {
  let effectiveSchema = schema;
  if (catalogMode !== 'current') {
    effectiveSchema = Object.fromEntries(
      Object.entries(effectiveSchema).filter(
        ([sectionName]) => sectionName !== 'events' && sectionName !== 'activities',
      ),
    );
  }
  if (modalityMode === 'current') return effectiveSchema;
  const withoutModalities = Object.fromEntries(
    Object.entries(effectiveSchema).filter(([sectionName]) => sectionName !== 'modalities'),
  );
  const legacyRegistrations = Object.fromEntries(
    Object.entries(withoutModalities.registrations).filter(
      ([fieldName]) => fieldName !== 'modalityId' && fieldName !== 'appliedAmount',
    ),
  );
  return { ...withoutModalities, registrations: legacyRegistrations };
}

function valuesEqual(left, right) {
  return String(left) === String(right);
}

function parseSourceDate(value, timezoneOffset, endOfDay = false) {
  if (value == null) return null;
  if (value instanceof Date) return new Date(value.getTime());
  const normalized = String(value).trim().replace(' ', 'T');
  const dateTime = /^\d{4}-\d{2}-\d{2}$/u.test(normalized)
    ? `${normalized}T${endOfDay ? '23:59:59.999' : '00:00:00'}`
    : normalized;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/iu.test(dateTime);
  const parsed = new Date(hasTimezone ? dateTime : `${dateTime}${timezoneOffset}`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid EvComp catalog date: ${String(value)}`);
  return parsed;
}

function combineSourceDateTime(dateValue, timeValue, timezoneOffset) {
  if (dateValue == null || timeValue == null) return null;
  const date = dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue).trim().slice(0, 10);
  let time = timeValue instanceof Date ? timeValue.toISOString().slice(11, 19) : String(timeValue).trim();
  if (/^\d{2}:\d{2}$/u.test(time)) time += ':00';
  return parseSourceDate(`${date}T${time}`, timezoneOffset);
}

function toSourceInteger(value, fieldName) {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid EvComp ${fieldName}: ${String(value)}`);
  return parsed;
}

function hoursToMinutes(value, fieldName) {
  const hours = toSourceInteger(value, fieldName);
  return hours == null ? null : hours * 60;
}
