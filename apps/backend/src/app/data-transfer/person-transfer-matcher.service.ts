import type { ResourceOfKind } from '@cacic-fct/shared-data-transfer';
import { AttendanceImportMatchType } from '@cacic-fct/shared-data-types';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { getBrazilianPhoneCandidates } from '../common/brazilian-phone';
import { PersonCsvImportSupport } from '../common/person-csv-import-support';
import { PrismaService } from '../prisma/prisma.service';

export type TransferPersonReference = NonNullable<ResourceOfKind<'event-attendance'>['data']['person']>;

export type TransferPersonMatch = { id: string } | { message: string };

/** Uses the CSV import's exact normalization and ambiguity rules, without creating people. */
@Injectable()
export class PersonTransferMatcherService extends PersonCsvImportSupport {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  async match(reference: TransferPersonReference, tx: Prisma.TransactionClient): Promise<TransferPersonMatch> {
    let candidates: Set<string> | undefined;
    for (const [field, rawValue] of Object.entries(reference)) {
      if (typeof rawValue !== 'string' || !rawValue.trim()) {
        return { message: 'Informe ao menos um identificador válido da pessoa.' };
      }
      const ids = await this.matchesForField(field, rawValue, tx);
      candidates = candidates === undefined ? new Set(ids) : new Set(ids.filter((id) => candidates?.has(id)));
      if (candidates.size === 0) {
        return {
          message:
            'Pessoa não encontrada ou identificadores incompatíveis. O registro foi ignorado; nenhuma pessoa será criada.',
        };
      }
    }
    if (!candidates?.size) {
      return { message: 'Informe ao menos um identificador válido da pessoa.' };
    }
    if (candidates.size !== 1) {
      return {
        message:
          'Mais de uma pessoa corresponde aos dados informados. Acrescente um ID, e-mail ou outro identificador para revisar novamente.',
      };
    }
    return { id: [...candidates][0] };
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
              ? { phone: { in: getBrazilianPhoneCandidates(value) } }
              : { id: { in: [] } };
    const matches = await tx.people.findMany({
      where: { ...where, deletedAt: null, mergedIntoId: null },
      select: { id: true },
      take: 501,
    });
    return matches.map((person) => person.id);
  }
}
