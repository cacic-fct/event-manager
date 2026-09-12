import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import {
  catalogRequirementsFor,
  defaultSourceSchema,
  mergeSchema,
  normalizeActivityRow,
  normalizeEventRow,
  normalizeModalityRow,
  schemaForModes,
  validateRegistrationModalities,
} from './source-adapter.mjs';

const gunzipAsync = promisify(gunzip);

export async function readEvcompSqlDump(filePath, override = {}, timezoneOffset = '-03:00') {
  const contents = await readFile(filePath);
  const decoded = contents[0] === 0x1f && contents[1] === 0x8b ? await gunzipAsync(contents) : contents;
  const sql = decoded.toString('utf8');
  return parseEvcompSqlDump(sql, override, timezoneOffset);
}

export function parseEvcompSqlDump(sql, override = {}, timezoneOffset = '-03:00') {
  const schema = mergeSchema(defaultSourceSchema, override);
  const includedTables = new Set(Object.values(schema).map((section) => section.table));
  const tables = parseMysqlDump(sql, includedTables);
  const { catalogMode, modalityMode } = detectDumpModes(tables, schema);
  const effectiveSchema = schemaForModes(schema, { catalogMode, modalityMode });
  validateDumpSchema(tables, effectiveSchema);

  const events =
    catalogMode === 'current'
      ? rowsFor(tables, schema.events.table).map((item) =>
          normalizeEventRow(
            {
              sourceId: item[schema.events.id],
              name: item[schema.events.name],
              description: item[schema.events.description],
              startDate: item[schema.events.startDate],
              endDate: item[schema.events.endDate],
              subscriptionStartDate: item[schema.events.subscriptionStartDate],
              subscriptionEndDate: item[schema.events.subscriptionEndDate],
              link: item[schema.events.link],
            },
            timezoneOffset,
          ),
        )
      : [];
  const activities =
    catalogMode === 'current'
      ? rowsFor(tables, schema.activities.table).map((item) =>
          normalizeActivityRow(
            {
              sourceId: item[schema.activities.id],
              sourceEventId: item[schema.activities.eventId],
              name: item[schema.activities.name],
              description: item[schema.activities.description],
              location: item[schema.activities.location],
              startDate: item[schema.activities.startDate],
              endDate: item[schema.activities.endDate],
              startTime: item[schema.activities.startTime],
              endTime: item[schema.activities.endTime],
              slots: item[schema.activities.slots],
              durationHours: item[schema.activities.durationHours],
              lecturerDurationHours: item[schema.activities.lecturerDurationHours],
            },
            timezoneOffset,
          ),
        )
      : [];
  const modalities =
    modalityMode === 'current'
      ? rowsFor(tables, schema.modalities.table).map((item) =>
          normalizeModalityRow({
            sourceId: item[schema.modalities.id],
            sourceEventId: item[schema.modalities.eventId],
            name: item[schema.modalities.name],
            amount: item[schema.modalities.amount],
          }),
        )
      : [];
  const modalityById = new Map(
    rowsFor(tables, schema.modalities.table).map((modality) => [String(modality[schema.modalities.id]), modality]),
  );

  const registrations = rowsFor(tables, effectiveSchema.registrations.table).flatMap((registration) => {
    const activities = rowsFor(tables, effectiveSchema.registrationActivities.table).filter((item) =>
      valuesEqual(
        item[effectiveSchema.registrationActivities.registrationId],
        registration[effectiveSchema.registrations.id],
      ),
    );
    const base = {
      sourceId: registration[effectiveSchema.registrations.id],
      sourcePersonId: registration[effectiveSchema.registrations.userId],
      sourceEventId: registration[effectiveSchema.registrations.eventId],
      createdAt: parseDumpDate(registration[effectiveSchema.registrations.createdAt], timezoneOffset),
      active: registration[effectiveSchema.registrations.active],
    };
    if (modalityMode === 'current') {
      const sourceModalityId = registration[schema.registrations.modalityId];
      const modality = modalityById.get(String(sourceModalityId));
      Object.assign(base, {
        sourceModalityId,
        sourceModalityEventId: modality?.[schema.modalities.eventId] ?? null,
        modalityName: modality?.[schema.modalities.name] ?? null,
        appliedAmount: registration[schema.registrations.appliedAmount],
      });
    }
    return activities.length
      ? activities.map((item) => ({ ...base, sourceActivityId: item[schema.registrationActivities.activityId] }))
      : [{ ...base, sourceActivityId: null }];
  });
  if (modalityMode === 'current') validateRegistrationModalities(registrations);
  const attendances = rowsFor(tables, effectiveSchema.attendances.table).map((item) => ({
    sourceId: item[schema.attendances.id],
    sourcePersonId: item[schema.attendances.userId],
    sourceActivityId: item[schema.attendances.activityId],
    recordedAt: parseDumpDate(item[schema.attendances.recordedAt], timezoneOffset),
    present: item[schema.attendances.present],
  }));
  const lecturers = rowsFor(tables, effectiveSchema.lecturers.table).map((item) => ({
    sourcePersonId: item[schema.lecturers.userId],
    sourceActivityId: item[schema.lecturers.activityId],
  }));
  const referencedPersonIds = new Set(
    [...registrations, ...attendances, ...lecturers].map((item) => String(item.sourcePersonId)),
  );
  const includedTypes = new Set(schema.users.includedTypes.map(String));
  const people = rowsFor(tables, effectiveSchema.users.table)
    .filter(
      (item) =>
        referencedPersonIds.has(String(item[effectiveSchema.users.id])) &&
        includedTypes.has(String(item[effectiveSchema.users.type])),
    )
    .map((item) => ({
      sourceId: item[effectiveSchema.users.id],
      name: item[effectiveSchema.users.name],
      email: item[effectiveSchema.users.email],
      academicId: item[effectiveSchema.users.academicId],
    }));
  return { people, events, activities, modalities, registrations, attendances, lecturers };
}

function parseDumpDate(value, timezoneOffset) {
  if (value instanceof Date || value == null) return value;
  const normalized = String(value).trim().replace(' ', 'T');
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const parsed = new Date(hasTimezone ? normalized : `${normalized}${timezoneOffset}`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid EvComp SQL dump date: ${String(value)}`);
  return parsed;
}

export function parseMysqlDump(sql, includedTables = null) {
  const tables = new Map();
  for (const statement of splitSqlStatements(sql)) {
    const create = statement.match(
      /^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(`(?:``|[^`])+`|[\p{L}\p{N}_]+)\s*\(([\s\S]*)\)\s*(?:ENGINE\b[\s\S]*)?$/iu,
    );
    if (create) {
      const name = unquoteIdentifier(create[1]);
      const columns = splitTopLevel(create[2]).flatMap((definition) => {
        const match = definition.trim().match(/^(`(?:``|[^`])+`|[\p{L}\p{N}_]+)/u);
        if (!match || /^(PRIMARY|UNIQUE|KEY|CONSTRAINT|FULLTEXT|SPATIAL|CHECK|FOREIGN)$/i.test(match[1])) return [];
        return [unquoteIdentifier(match[1])];
      });
      tables.set(name, { columns, rows: tables.get(name)?.rows ?? [] });
      continue;
    }

    const insert = statement.match(
      /^INSERT(?:\s+IGNORE)?\s+INTO\s+(`(?:``|[^`])+`|[\p{L}\p{N}_]+)\s*(?:\(([^)]*)\))?\s+VALUES\s+([\s\S]+)$/iu,
    );
    if (!insert) continue;
    const name = unquoteIdentifier(insert[1]);
    if (includedTables && !includedTables.has(name)) continue;
    const knownTable = tables.get(name) ?? { columns: [], rows: [] };
    const columns = insert[2]
      ? splitTopLevel(insert[2]).map((item) => unquoteIdentifier(item.trim()))
      : knownTable.columns;
    if (!columns.length) {
      throw new Error(`SQL dump INSERT for ${name} has no column list or preceding CREATE TABLE.`);
    }
    for (const tuple of parseValueTuples(insert[3])) {
      if (tuple.length !== columns.length) {
        throw new Error(`SQL dump INSERT for ${name} has ${tuple.length} values; expected ${columns.length}.`);
      }
      knownTable.rows.push(Object.fromEntries(columns.map((column, index) => [column, tuple[index]])));
    }
    knownTable.columns = [...new Set([...knownTable.columns, ...columns])];
    tables.set(name, knownTable);
  }
  return tables;
}

function validateDumpSchema(tables, schema) {
  const missing = [];
  for (const [sectionName, section] of Object.entries(schema)) {
    const table = tables.get(section.table);
    if (!table) {
      missing.push(`${sectionName} table (${section.table})`);
      continue;
    }
    for (const [fieldName, column] of Object.entries(section)) {
      if (fieldName === 'table' || fieldName === 'includedTypes') continue;
      if (!table.columns.includes(column)) missing.push(`${sectionName}.${column} (${section.table})`);
    }
  }
  if (missing.length) {
    throw new Error(`EvComp SQL dump schema drift detected; update sourceSchema for: ${missing.join(', ')}`);
  }
}

function detectDumpModes(tables, schema) {
  return {
    catalogMode: detectDumpFeatureMode(tables, catalogRequirementsFor(schema), [
      schema.events?.table,
      schema.activities?.table,
    ]),
    modalityMode: detectDumpFeatureMode(tables, modalityRequirementsFor(schema), [schema.modalities?.table]),
  };
}

function detectDumpFeatureMode(tables, requirements, featureTables) {
  if (!requirements.length) return 'legacy';
  const present = requirements.filter((item) => tables.get(item.table)?.columns.includes(item.column));
  const featurePresent =
    present.length > 0 || featureTables.some((tableName) => tableName != null && tables.has(tableName));
  if (!featurePresent) return 'legacy';
  if (present.length === requirements.length) return 'current';
  const missing = requirements
    .filter((item) => !tables.get(item.table)?.columns.includes(item.column))
    .map((item) => `${item.sectionName}.${item.column} (${item.table})`);
  throw new Error(`EvComp SQL dump schema drift detected; update sourceSchema for: ${missing.join(', ')}`);
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

function rowsFor(tables, tableName) {
  return tables.get(tableName)?.rows ?? [];
}

function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let quote = null;
  let blockComment = false;
  let lineComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (lineComment) {
      if (char === '\n' || char === '\r') lineComment = false;
      continue;
    }
    if (!quote && char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (!quote && (char === '#' || (char === '-' && next === '-' && /\s/.test(sql[index + 2] ?? '')))) {
      lineComment = true;
      if (char === '-') index += 1;
      continue;
    }
    if (quote) {
      current += char;
      if (char === '\\' && quote !== '`') {
        current += sql[index + 1] ?? '';
        index += 1;
      } else if (char === quote) {
        if (sql[index + 1] === quote) {
          current += quote;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
    } else if (char === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (quote || blockComment) throw new Error('SQL dump ends inside a quote or comment.');
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function parseValueTuples(valueSql) {
  const tuples = [];
  let index = 0;
  while (index < valueSql.length) {
    while (/[\s,]/.test(valueSql[index] ?? '')) index += 1;
    if (valueSql[index] !== '(')
      throw new Error(`Unsupported SQL dump VALUES syntax near: ${valueSql.slice(index, index + 30)}`);
    const end = findClosingParenthesis(valueSql, index);
    tuples.push(splitTopLevel(valueSql.slice(index + 1, end)).map(parseMysqlValue));
    index = end + 1;
  }
  return tuples;
}

function findClosingParenthesis(value, start) {
  let depth = 0;
  let quote = null;
  for (let index = start; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      if (char === '\\') index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"') quote = char;
    else if (char === '(') depth += 1;
    else if (char === ')' && --depth === 0) return index;
  }
  throw new Error('SQL dump has an unclosed VALUES tuple.');
}

function splitTopLevel(value) {
  const parts = [];
  let current = '';
  let depth = 0;
  let quote = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quote) {
      current += char;
      if (char === '\\' && quote !== '`') {
        current += value[index + 1] ?? '';
        index += 1;
      } else if (char === quote) {
        if (value[index + 1] === quote) {
          current += quote;
          index += 1;
        } else quote = null;
      }
    } else if (char === "'" || char === '"' || char === '`') {
      quote = char;
      current += char;
    } else if (char === '(') {
      depth += 1;
      current += char;
    } else if (char === ')') {
      depth -= 1;
      current += char;
    } else if (char === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += char;
  }
  parts.push(current.trim());
  return parts;
}

function parseMysqlValue(token) {
  const trimmed = token.trim();
  if (/^NULL$/i.test(trimmed)) return null;
  if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return decodeMysqlString(trimmed.slice(1, -1), trimmed[0]);
  }
  throw new Error(`Unsupported SQL dump value: ${trimmed.slice(0, 80)}`);
}

function decodeMysqlString(value, quote) {
  const escapes = { 0: '\0', b: '\b', n: '\n', r: '\r', t: '\t', Z: '\x1a' };
  let result = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === '\\') {
      const next = value[++index];
      result += escapes[next] ?? next ?? '';
    } else if (char === quote && value[index + 1] === quote) {
      result += quote;
      index += 1;
    } else result += char;
  }
  return result;
}

function unquoteIdentifier(value) {
  const trimmed = value.trim();
  return trimmed.startsWith('`') && trimmed.endsWith('`') ? trimmed.slice(1, -1).replaceAll('``', '`') : trimmed;
}

function valuesEqual(left, right) {
  return String(left) === String(right);
}
