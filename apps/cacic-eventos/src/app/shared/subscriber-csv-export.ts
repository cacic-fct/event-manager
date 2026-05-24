import { Person } from '../graphql/models';

export type SubscriberCsvField = 'fullName' | 'email' | 'identityDocument' | 'enrollmentNumber' | 'unespRole' | 'phone';

export type IdentityDocumentExportMode = 'masked' | 'complete';

export interface SubscriberCsvExportOptions {
  fields: SubscriberCsvField[];
  identityDocumentMode: IdentityDocumentExportMode;
}

export interface SubscriberCsvRecord {
  person?: Person | null;
}

const SUBSCRIBER_FIELD_HEADERS: Record<SubscriberCsvField, string> = {
  fullName: 'Nome completo',
  email: 'E-mail',
  identityDocument: 'Documento de identidade',
  enrollmentNumber: 'Matrícula',
  unespRole: 'Vínculo Unesp',
  phone: 'Telefone',
};

export const DEFAULT_SUBSCRIBER_CSV_EXPORT_OPTIONS: SubscriberCsvExportOptions = {
  fields: ['fullName', 'identityDocument'],
  identityDocumentMode: 'masked',
};

export function buildSubscriberCsv(records: SubscriberCsvRecord[], options: SubscriberCsvExportOptions): string {
  const headers = options.fields.map((field) => SUBSCRIBER_FIELD_HEADERS[field]);
  const rows = records.map((record) =>
    options.fields.map((field) => getSubscriberFieldValue(record.person, field, options.identityDocumentMode)),
  );

  return [headers, ...rows].map((row) => row.map(escapeCsvValue).join(';')).join('\r\n');
}

export function getSubscriberFieldValue(
  person: Person | null | undefined,
  field: SubscriberCsvField,
  identityDocumentMode: IdentityDocumentExportMode,
): string {
  if (!person) {
    return '';
  }

  switch (field) {
    case 'fullName':
      return person.name;
    case 'email':
      return person.email ?? '';
    case 'identityDocument':
      return formatIdentityDocumentForExport(person.identityDocument, identityDocumentMode);
    case 'enrollmentNumber':
      return person.academicId ?? '';
    case 'unespRole':
      return person.user?.role ?? '';
    case 'phone':
      return person.phone ?? '';
  }
}

export function formatIdentityDocumentForExport(
  value: string | null | undefined,
  mode: IdentityDocumentExportMode,
): string {
  const document = value?.trim() ?? '';
  if (!document) {
    return '';
  }

  if (!isValidCpf(document)) {
    return document;
  }

  const digits = onlyDigits(document);
  if (mode === 'complete') {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }

  return `•••.${digits.slice(3, 6)}.${digits.slice(6, 9)}-••`;
}

export function isValidCpf(value: string | null | undefined): boolean {
  const digits = onlyDigits(value ?? '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  const firstVerifier = calculateCpfVerifier(digits.slice(0, 9));
  const secondVerifier = calculateCpfVerifier(`${digits.slice(0, 9)}${firstVerifier}`);
  return digits === `${digits.slice(0, 9)}${firstVerifier}${secondVerifier}`;
}

function calculateCpfVerifier(baseDigits: string): number {
  const multiplierStart = baseDigits.length + 1;
  const sum = [...baseDigits].reduce((total, digit, index) => total + Number(digit) * (multiplierStart - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function escapeCsvValue(value: string): string {
  if (!/[;\r\n"]/.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '""')}"`;
}
