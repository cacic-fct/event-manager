import { transferPhoneCandidates, type ResourceOfKind } from '@cacic-fct/shared-data-transfer';
import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../common/brazilian-phone';
import { PersonCsvImportSupport } from '../common/person-csv-import-support';
import { PrismaService } from '../prisma/prisma.service';

export type TransferPersonReference = NonNullable<ResourceOfKind<'event-attendance'>['data']['person']>;

export type TransferPersonMatch = { id: string } | { message: string; missing?: boolean; reviewIds?: string[] };

/** Checks every identifier before distinguishing a missing person from conflicting data. */
@Injectable()
export class PersonTransferMatcherService extends PersonCsvImportSupport {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async match(reference: TransferPersonReference, tx: Prisma.TransactionClient): Promise<TransferPersonMatch> {
    let candidates: Set<string> | undefined;
    const allMatches = new Set<string>();
    let nameMatches: string[] = [];
    for (const [field, rawValue] of Object.entries(reference)) {
      if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return { message: 'Informe ao menos um identificador válido da pessoa.' };
      }
      const ids = await this.matchesForField(field, rawValue, tx);
      if (field === 'name') nameMatches = ids;
      candidates = candidates === undefined ? new Set(ids) : new Set(ids.filter((id) => candidates?.has(id)));
      for (const id of ids) allMatches.add(id);
    }
    if (!candidates?.size) {
      if (Object.keys(reference).length === 0)
        return { message: 'Informe ao menos um identificador válido da pessoa.' };
      // Missing one field is never proof that the person is new. Check all supplied fields,
      // including inactive records, before exposing a creation prompt.
      const missing =
        allMatches.size === 0 && !reference.id && !reference.userId && !(await this.hasReservedIdentity(reference, tx));
      return {
        missing,
        ...(!reference.id && !reference.userId && nameMatches.length ? { reviewIds: nameMatches } : {}),
        message: missing
          ? 'Nenhuma pessoa corresponde aos dados informados. Confirme a criação ou ignore os registros desta pessoa.'
          : 'Os identificadores não correspondem a uma única pessoa existente. Corrija os dados antes de importar.',
      };
    }
    if (candidates.size !== 1) {
      return {
        ...(!reference.id && !reference.userId && nameMatches.length ? { reviewIds: nameMatches } : {}),
        message:
          'Mais de uma pessoa corresponde aos dados informados. Acrescente um ID, e-mail ou outro identificador para revisar novamente.',
      };
    }
    return { id: [...candidates][0] };
  }

  async hasReservedIdentity(
    reference: TransferPersonReference,
    tx: Prisma.TransactionClient,
    excludeId?: string,
    includeName = true,
  ): Promise<boolean> {
    const filters: Prisma.PeopleWhereInput[] = [];
    if (includeName && reference.name)
      filters.push(
        ...this.buildPeopleMatchFilters(
          [this.normalizeImportValue(reference.name, AttendanceImportMatchType.FULL_NAME)],
          AttendanceImportMatchType.FULL_NAME,
        ),
      );
    if (reference.email)
      filters.push(
        ...this.buildPeopleMatchFilters([reference.email.trim().toLowerCase()], AttendanceImportMatchType.EMAIL),
      );
    if (reference.academicId)
      filters.push({ academicId: { equals: reference.academicId.trim(), mode: 'insensitive' } });
    if (reference.identityDocument)
      filters.push(
        ...this.buildPeopleMatchFilters([reference.identityDocument], AttendanceImportMatchType.IDENTITY_DOCUMENT),
      );
    if (reference.phone)
      filters.push({
        phone: { in: [...getBrazilianPhoneCandidates(reference.phone), ...transferPhoneCandidates(reference.phone)] },
      });
    if (!filters.length) return includeName;
    return (
      (
        await tx.people.findMany({
          where: { OR: filters, ...(excludeId ? { id: { not: excludeId } } : {}) },
          select: { id: true },
          take: 1,
        })
      ).length > 0
    );
  }

  async reviewCandidates(ids: readonly string[], tx: Prisma.TransactionClient) {
    return tx.people.findMany({
      where: { id: { in: [...ids] }, deletedAt: null, mergedIntoId: null },
      select: {
        id: true,
        name: true,
        email: true,
        secondaryEmails: true,
        phone: true,
        academicId: true,
        identityDocument: true,
        userId: true,
        updatedAt: true,
      },
      take: 501,
    });
  }

  private async matchesForField(field: string, value: string, tx: Prisma.TransactionClient): Promise<string[]> {
    const matchType =
      field === 'name'
        ? AttendanceImportMatchType.FULL_NAME
        : field === 'email'
          ? AttendanceImportMatchType.EMAIL
          : field === 'identityDocument'
            ? AttendanceImportMatchType.IDENTITY_DOCUMENT
            : undefined;
    if (matchType) {
      const matches = await this.findPeopleByImportValues([value], matchType, tx);
      const key = this.normalizeImportValue(value, matchType);
      const unique = matches.personByValue.get(key);
      return unique ? [unique.id] : (matches.ambiguousPeopleByValue.get(key) ?? []).map((person) => person.id);
    }
    const where: Prisma.PeopleWhereInput =
      field === 'id'
        ? { id: value.trim() }
        : field === 'userId'
          ? { userId: value.trim() }
          : field === 'academicId'
            ? { academicId: { equals: value.trim(), mode: 'insensitive' } }
            : field === 'phone'
              ? { phone: { in: [...getBrazilianPhoneCandidates(value), ...transferPhoneCandidates(value)] } }
              : { id: { in: [] } };
    const matches = await tx.people.findMany({
      where: { ...where, deletedAt: null, mergedIntoId: null },
      select: { id: true },
      take: 501,
    });
    return matches.map((person) => person.id);
  }
}
