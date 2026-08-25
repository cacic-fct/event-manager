import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import { mergeSchema } from './source-adapter.mjs';
import { defaultSourceSchema } from './source-adapter.mjs';

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
  validateDumpSchema(tables, schema);

  const registrations = rowsFor(tables, schema.registrations.table).flatMap((registration) => {
    const activities = rowsFor(tables, schema.registrationActivities.table).filter((item) =>
      valuesEqual(item[schema.registrationActivities.registrationId], registration[schema.registrations.id]),
    );
    const base = {
      sourceId: registration[schema.registrations.id],
      sourcePersonId: registration[schema.registrations.userId],
      sourceEventId: registration[schema.registrations.eventId],
      createdAt: parseDumpDate(registration[schema.registrations.createdAt], timezoneOffset),
      active: registration[schema.registrations.active],
    };
    return activities.length
      ? activities.map((item) => ({ ...base, sourceActivityId: item[schema.registrationActivities.activityId] }))
      : [{ ...base, sourceActivityId: null }];
  });
  const attendances = rowsFor(tables, schema.attendances.table).map((item) => ({
    sourceId: item[schema.attendances.id],
    sourcePersonId: item[schema.attendances.userId],
    sourceActivityId: item[schema.attendances.activityId],
    recordedAt: parseDumpDate(item[schema.attendances.recordedAt], timezoneOffset),
    present: item[schema.attendances.present],
  }));
  const lecturers = rowsFor(tables, schema.lecturers.table).map((item) => ({
    sourcePersonId: item[schema.lecturers.userId],
    sourceActivityId: item[schema.lecturers.activityId],
  }));
  const referencedPersonIds = new Set(
    [...registrations, ...attendances, ...lecturers].map((item) => String(item.sourcePersonId)),
  );
  const includedTypes = new Set(schema.users.includedTypes.map(String));
  const people = rowsFor(tables, schema.users.table)
    .filter(
      (item) =>
        referencedPersonIds.has(String(item[schema.users.id])) && includedTypes.has(String(item[schema.users.type])),
    )
    .map((item) => ({
      sourceId: item[schema.users.id],
      name: item[schema.users.name],
      email: item[schema.users.email],
      academicId: item[schema.users.academicId],
    }));
  return { people, registrations, attendances, lecturers };
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
