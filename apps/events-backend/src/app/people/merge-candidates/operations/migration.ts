import { PersonMergeField } from '@cacic-fct/shared-data-types';
import { UnprocessableEntityException } from '@nestjs/common';
import { People, Prisma } from '@prisma/client';
import { normalizeEmail } from './matching';

export function normalizeMigrateFields(rawFields?: PersonMergeField[] | null): PersonMergeField[] {
  const fields = rawFields ?? [];
  return [...new Set(fields)];
}

export function buildTargetMigrationData(
  migrateFields: PersonMergeField[],
  targetPerson: People,
  sourcePerson: People,
): Prisma.PeopleUncheckedUpdateInput {
  const updateData: Prisma.PeopleUncheckedUpdateInput = {};
  const mergedSecondaryEmails = mergeSecondaryEmails(migrateFields, targetPerson, sourcePerson);

  if (mergedSecondaryEmails !== targetPerson.secondaryEmails) {
    updateData.secondaryEmails = mergedSecondaryEmails;
  }

  for (const field of migrateFields) {
    if (field === 'NAME') {
      updateData.name = ensureMigratableValue(sourcePerson.name, field);
      continue;
    }

    if (field === 'EMAIL') {
      updateData.email = ensureMigratableValue(sourcePerson.email, field);
      continue;
    }

    if (field === 'IDENTITY_DOCUMENT') {
      updateData.identityDocument = ensureMigratableValue(sourcePerson.identityDocument, field);
      continue;
    }

    if (field === 'ACADEMIC_ID') {
      updateData.academicId = ensureMigratableValue(sourcePerson.academicId, field);
      continue;
    }

    if (field === 'USER_ID') {
      updateData.userId = ensureMigratableValue(sourcePerson.userId, field);
      continue;
    }

    if (field === 'EXTERNAL_REF') {
      updateData.externalRef = ensureMigratableValue(sourcePerson.externalRef, field);
    }
  }

  return updateData;
}

export function mergeSecondaryEmails(
  migrateFields: PersonMergeField[],
  targetPerson: People,
  sourcePerson: People,
): string[] {
  const finalPrimaryEmail = migrateFields.includes('EMAIL')
    ? ensureMigratableValue(sourcePerson.email, 'EMAIL')
    : targetPerson.email;
  const normalizedFinalPrimaryEmail = normalizeEmail(finalPrimaryEmail);
  const nextSecondaryEmails = [...targetPerson.secondaryEmails];
  const knownEmails = new Set(
    [finalPrimaryEmail, ...targetPerson.secondaryEmails]
      .map((email) => normalizeEmail(email))
      .filter((email): email is string => email !== null),
  );

  for (const email of [targetPerson.email, sourcePerson.email]) {
    const trimmedEmail = email?.trim();
    const normalizedEmail = normalizeEmail(email);

    if (
      !trimmedEmail ||
      !normalizedEmail ||
      normalizedEmail === normalizedFinalPrimaryEmail ||
      knownEmails.has(normalizedEmail)
    ) {
      continue;
    }

    nextSecondaryEmails.push(trimmedEmail);
    knownEmails.add(normalizedEmail);
  }

  return nextSecondaryEmails.length === targetPerson.secondaryEmails.length
    ? targetPerson.secondaryEmails
    : nextSecondaryEmails;
}

export function ensureMigratableValue(value: string | null, field: PersonMergeField): string {
  if (value === null) {
    throw new UnprocessableEntityException(`Cannot migrate ${field} because source value is null.`);
  }

  const normalized = value.trim();
  if (!normalized) {
    throw new UnprocessableEntityException(`Cannot migrate ${field} because source value is empty.`);
  }

  return normalized;
}
