import { type LgpdResolvedPerson } from './lgpd-records';

export function mapPersonForExport(person: LgpdResolvedPerson) {
  return {
    id: person.id,
    name: person.name,
    email: person.email,
    secondaryEmails: person.secondaryEmails,
    phone: person.phone,
    identityDocument: person.identityDocument,
    isCPF: person.isCPF,
    academicId: person.academicId,
    userId: person.userId,
    externalRef: person.externalRef,
    mergedIntoId: person.mergedIntoId,
    mergedFromIds: person.mergedFrom.map((mergedPerson) => mergedPerson.id),
    deletedAt: person.deletedAt,
    createdAt: person.createdAt,
    updatedAt: person.updatedAt,
  };
}

export function selectManyForExport(records: readonly object[], select: object): Record<string, unknown>[] {
  return records.map((record) => selectForExport(record, select));
}

export function selectForExport(record: object, select: object): Record<string, unknown> {
  const source = record as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, selector] of Object.entries(select)) {
    if (selector === true) {
      result[key] = source[key];
      continue;
    }

    if (!hasNestedSelect(selector)) {
      continue;
    }

    const nestedValue = source[key];
    if (Array.isArray(nestedValue)) {
      result[key] = nestedValue
        .filter((value): value is Record<string, unknown> => isPlainRecord(value))
        .map((value) => selectForExport(value, selector.select));
      continue;
    }

    result[key] = isPlainRecord(nestedValue) ? selectForExport(nestedValue, selector.select) : nestedValue;
  }

  return result;
}

function hasNestedSelect(value: unknown): value is { select: object } {
  return isPlainRecord(value) && isPlainRecord(value['select']);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}
