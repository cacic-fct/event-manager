import { readFile } from 'node:fs/promises';

export type SqlLiteral = string | number | null;
export type ParsedSqlRow = Record<string, SqlLiteral>;
export type ParsedSqlTables = Record<string, ParsedSqlRow[]>;

export interface MysqlTime {
  hours: number;
  minutes: number;
  seconds: number;
}

const SQL_NUMBER_PATTERN = /^-?\d+(?:\.\d+)?$/;
const MOJIBAKE_PATTERN = /(?:Ã.|Â.|â[\u0080-\u00BF])/u;
const WHITESPACE_PATTERN = /\s+/gu;
const HTML_TAG_PATTERN = /<[^>]+>/gu;
const ROMAN_NUMERAL_PATTERN = /^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/iu;
const LOWERCASE_NAME_PARTICLES = new Set([
  'da',
  'das',
  'de',
  'del',
  'della',
  'di',
  'do',
  'dos',
  'du',
  'e',
  'la',
  'le',
  'van',
  'von',
]);

const MYSQL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MYSQL_TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/u;
const MYSQL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/u;

export async function parseInsertRowsByTable(
  sqlPath: string | URL,
  expectedTables: ReadonlySet<string>,
): Promise<ParsedSqlTables> {
  const content = await readFile(sqlPath, 'utf8');
  const result: ParsedSqlTables = Object.fromEntries(
    [...expectedTables].map((table) => [table, [] as ParsedSqlRow[]]),
  ) as ParsedSqlTables;
  const statementPattern = /INSERT\s+INTO\s+`([^`]+)`\s*\(([^)]*)\)\s*VALUES/giu;
  let position = 0;

  while (true) {
    statementPattern.lastIndex = position;
    const match = statementPattern.exec(content);
    if (!match) {
      break;
    }

    const statementEnd = findStatementEnd(content, statementPattern.lastIndex);
    const tableName = match[1];
    const rawColumns = match[2];
    if (tableName === undefined || rawColumns === undefined) {
      throw new Error('Could not parse INSERT statement columns.');
    }
    if (expectedTables.has(tableName)) {
      const columnNames = rawColumns.split(',').map(cleanIdentifier);
      const rows = parseValuesBlock(content.slice(statementPattern.lastIndex, statementEnd));
      for (const row of rows) {
        if (row.length !== columnNames.length) {
          continue;
        }
        const tableRows = result[tableName];
        if (tableRows === undefined) {
          throw new Error(`Unexpected SQL table '${tableName}'.`);
        }
        tableRows.push(Object.fromEntries(columnNames.map((column, index) => [column, row[index]])) as ParsedSqlRow);
      }
    }
    position = statementEnd + 1;
  }

  return result;
}

export function findStatementEnd(content: string, start: number): number {
  let inString = false;
  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (inString) {
      if (character === "'") {
        const nextCharacter = content[index + 1] ?? '';
        if (nextCharacter === "'") {
          index += 1;
          continue;
        }
        if (isBackslashEscaped(content, index)) {
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (character === "'") {
      inString = true;
    } else if (character === ';') {
      return index;
    }
  }
  throw new Error('Could not find the end of SQL statement.');
}

export function isBackslashEscaped(content: string, index: number): boolean {
  let backslashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && content[cursor] === '\\'; cursor -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

export function parseValuesBlock(valuesBlock: string): SqlLiteral[][] {
  const rows: SqlLiteral[][] = [];
  let inString = false;
  for (let index = 0; index < valuesBlock.length; index += 1) {
    const character = valuesBlock[index];
    if (inString) {
      if (character === "'") {
        const nextCharacter = valuesBlock[index + 1] ?? '';
        if (nextCharacter === "'") {
          index += 1;
          continue;
        }
        if (isBackslashEscaped(valuesBlock, index)) {
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (character === "'") {
      inString = true;
      continue;
    }
    if (character !== '(') {
      continue;
    }
    const tupleEnd = findClosingParenthesis(valuesBlock, index);
    rows.push(parseTuple(valuesBlock.slice(index + 1, tupleEnd)));
    index = tupleEnd;
  }
  return rows;
}

export function findClosingParenthesis(content: string, start: number): number {
  let inString = false;
  let depth = 1;
  for (let index = start + 1; index < content.length; index += 1) {
    const character = content[index];
    if (inString) {
      if (character === "'") {
        const nextCharacter = content[index + 1] ?? '';
        if (nextCharacter === "'") {
          index += 1;
          continue;
        }
        if (isBackslashEscaped(content, index)) {
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (character === "'") {
      inString = true;
    } else if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new Error('Could not find closing parenthesis in values block.');
}

export function parseTuple(tupleContent: string): SqlLiteral[] {
  const tokens: string[] = [];
  let tokenStart = 0;
  let inString = false;
  for (let index = 0; index < tupleContent.length; index += 1) {
    const character = tupleContent[index];
    if (inString) {
      if (character === "'") {
        const nextCharacter = tupleContent[index + 1] ?? '';
        if (nextCharacter === "'") {
          index += 1;
          continue;
        }
        if (isBackslashEscaped(tupleContent, index)) {
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (character === "'") {
      inString = true;
    } else if (character === ',') {
      tokens.push(tupleContent.slice(tokenStart, index));
      tokenStart = index + 1;
    }
  }
  tokens.push(tupleContent.slice(tokenStart));
  return tokens.map((token) => parseSqlLiteral(token.trim()));
}

export function parseSqlLiteral(token: string): SqlLiteral {
  if (token.toUpperCase() === 'NULL') {
    return null;
  }
  if (token.startsWith("'") && token.endsWith("'")) {
    const normalized = decodeLegacySqlString(token.slice(1, -1));
    if (normalized.trim().toLowerCase() === 'null') {
      return null;
    }
    return normalized;
  }
  if (SQL_NUMBER_PATTERN.test(token)) {
    if (token.includes('.')) {
      return token;
    }
    const number = Number(token);
    return Number.isSafeInteger(number) ? number : token;
  }
  return token;
}

function decodeLegacySqlString(value: string): string {
  let decoded = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\') {
      const escapedCharacter = value[index + 1];
      switch (escapedCharacter) {
        case 'r':
          decoded += '\r';
          index += 1;
          continue;
        case 'n':
          decoded += '\n';
          index += 1;
          continue;
        case 't':
          decoded += '\t';
          index += 1;
          continue;
        case '\\':
          decoded += '\\';
          index += 1;
          continue;
        case "'":
          decoded += "'";
          index += 1;
          continue;
        default:
          decoded += '\\';
          continue;
      }
    }

    if (character === "'" && value[index + 1] === "'") {
      decoded += "'";
      index += 1;
      continue;
    }

    decoded += character ?? '';
  }

  return decoded;
}

export function cleanIdentifier(rawIdentifier: string): string {
  return rawIdentifier.trim().replace(/^`|`$/gu, '');
}

function makeUtcDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date | null {
  const date = new Date(0);
  date.setUTCHours(hours, minutes, seconds, 0);
  date.setUTCFullYear(year, month - 1, day);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hours ||
    date.getUTCMinutes() !== minutes ||
    date.getUTCSeconds() !== seconds
  ) {
    return null;
  }
  return date;
}

export function parseMysqlDate(rawValue: unknown): Date | null {
  const text = coerceText(rawValue);
  if (!text) {
    return null;
  }
  const match = MYSQL_DATE_PATTERN.exec(text);
  return match ? makeUtcDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

export function parseMysqlTime(rawValue: unknown): MysqlTime | null {
  const text = coerceText(rawValue);
  if (!text) {
    return null;
  }
  const match = MYSQL_TIME_PATTERN.exec(text);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3] ?? 0);
  if (hours > 23 || minutes > 59 || seconds > 59) {
    return null;
  }
  return { hours, minutes, seconds };
}

export function parseMysqlDatetime(rawValue: unknown): Date | null {
  const text = coerceText(rawValue);
  if (!text) {
    return null;
  }
  const match = MYSQL_DATETIME_PATTERN.exec(text);
  return match
    ? makeUtcDate(
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
      )
    : null;
}

export function combineDateAndTime(eventDate: Date | null, eventTime: MysqlTime | null): Date | null {
  if (!(eventDate instanceof Date) || Number.isNaN(eventDate.getTime())) {
    return null;
  }
  const normalizedTime = eventTime ?? { hours: 0, minutes: 0, seconds: 0 };
  return makeUtcDate(
    eventDate.getUTCFullYear(),
    eventDate.getUTCMonth() + 1,
    eventDate.getUTCDate(),
    normalizedTime.hours,
    normalizedTime.minutes,
    normalizedTime.seconds,
  );
}

export function atStartOfDay(eventDate: Date | null): Date | null {
  return combineDateAndTime(eventDate, null);
}

export function decimalToInt(rawValue: unknown): number | null {
  if (rawValue == null) {
    return null;
  }
  if (typeof rawValue === 'boolean') {
    return rawValue ? 1 : 0;
  }
  if (typeof rawValue === 'number') {
    return Number.isFinite(rawValue) && Number.isSafeInteger(Math.trunc(rawValue)) ? Math.trunc(rawValue) : null;
  }
  const text = String(rawValue).trim();
  if (!SQL_NUMBER_PATTERN.test(text)) {
    return null;
  }
  const integerText = text.split('.', 1)[0] ?? '';
  try {
    const integer = BigInt(integerText);
    return integer >= BigInt(Number.MIN_SAFE_INTEGER) && integer <= BigInt(Number.MAX_SAFE_INTEGER)
      ? Number(integer)
      : null;
  } catch {
    return null;
  }
}

/** Convert a nonnegative legacy BRL decimal value to integer centavos. */
export function decimalToCents(rawValue: unknown): number | null {
  if (rawValue == null) {
    return null;
  }
  const match = /^(\d+)(?:\.(\d{1,2}))?$/u.exec(String(rawValue).trim());
  if (!match) {
    return null;
  }
  try {
    const cents = BigInt(match[1] ?? '0') * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0');
    return cents <= 2_147_483_647n ? Number(cents) : null;
  } catch {
    return null;
  }
}

export function coerceText(value: unknown, { fixMojibake = false }: { fixMojibake?: boolean } = {}): string | null {
  if (value == null) {
    return null;
  }
  let text = String(value).trim();
  if (!text || text.toLowerCase() === 'null') {
    return null;
  }
  if (fixMojibake) {
    text = repairMojibake(text);
  }
  text = text.replace(WHITESPACE_PATTERN, ' ').trim();
  return text && text.toLowerCase() !== 'null' ? text : null;
}

export function repairMojibake(text: string): string {
  let current = text;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (!looksLikeMojibake(current)) {
      break;
    }
    if ([...current].some((character) => (character.codePointAt(0) ?? 0) > 0xff)) {
      break;
    }
    const candidate = Buffer.from(current, 'latin1').toString('utf8');
    if (candidate.includes('\uFFFD') || mojibakeScore(candidate) >= mojibakeScore(current)) {
      break;
    }
    current = candidate;
  }
  return current;
}

export function looksLikeMojibake(text: string): boolean {
  return MOJIBAKE_PATTERN.test(text);
}

export function mojibakeScore(text: string): number {
  return text.match(new RegExp(MOJIBAKE_PATTERN.source, 'gu'))?.length ?? 0;
}

export function normalizeCpf(rawValue: unknown): string | null {
  const text = coerceText(rawValue);
  if (!text) {
    return null;
  }
  let digits = [...text].filter((character) => /[0-9]/u.test(character)).join('');
  if (!digits) {
    return null;
  }
  if (digits.length > 11) {
    digits = digits.slice(-11);
  }
  return digits.padStart(11, '0');
}

export function normalizeEmail(rawValue: unknown): string | null {
  const text = coerceText(rawValue, { fixMojibake: true });
  return text?.toLowerCase() ?? null;
}

export function normalizePersonName(rawName: unknown): string | null {
  const text = coerceText(rawName, { fixMojibake: true });
  if (!text) {
    return null;
  }
  const tokens = text.split(' ').filter(Boolean);
  return tokens.length ? tokens.map((token, index) => normalizeNameToken(token, index)).join(' ') : null;
}

export function normalizeNameToken(token: string, tokenIndex: number): string {
  return token
    .split('-')
    .map((hyphenChunk) =>
      hyphenChunk
        .replaceAll('’', "'")
        .split("'")
        .map((apostropheChunk, apostropheIndex) => {
          const lowered = apostropheChunk.toLowerCase();
          if (tokenIndex > 0 && apostropheIndex === 0 && LOWERCASE_NAME_PARTICLES.has(lowered)) {
            return lowered;
          }
          if (ROMAN_NUMERAL_PATTERN.test(apostropheChunk)) {
            return apostropheChunk.toUpperCase();
          }
          return apostropheChunk.slice(0, 1).toUpperCase() + apostropheChunk.slice(1).toLowerCase();
        })
        .join("'"),
    )
    .join('-');
}

export function stripHtml(rawText: unknown): string | null {
  const text = coerceText(rawText, { fixMojibake: true });
  if (!text) {
    return null;
  }
  const stripped = text.replace(HTML_TAG_PATTERN, ' ').replace(WHITESPACE_PATTERN, ' ').trim();
  return stripped || null;
}

export function buildPrefixedId(prefix: string, ...parts: unknown[]): string {
  const joined = parts.map(normalizeIdPart).filter(Boolean).join('-') || 'id';
  return `${prefix}${joined}`;
}

export function normalizeIdPart(value: unknown): string {
  const text = coerceText(value, { fixMojibake: true }) ?? '';
  return text.replace(/[^a-zA-Z0-9_.-]+/gu, '-').replace(/^-+|-+$/gu, '');
}

export function utcNow(): Date {
  return new Date();
}
