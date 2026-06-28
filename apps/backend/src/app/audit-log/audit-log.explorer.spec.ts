import { BadRequestException } from '@nestjs/common';
import { AuditLogEntityType, AuditLogOperation, Prisma } from '@prisma/client';
import {
  assertValidAuditLogExplorerDateRange,
  buildAuditLogSearchQuery,
  buildAuditLogSqlWhere,
  buildAuditLogTypesenseFilter,
} from './audit-log.explorer';
import { AuditLogExplorerRevertedStatus } from './audit-log.models';

describe('audit log explorer helpers', () => {
  it('builds the Typesense query and filter from explorer input', () => {
    const dateFrom = new Date('2026-06-20T00:00:00.000Z');
    const dateTo = new Date('2026-06-25T23:59:59.999Z');

    expect(buildAuditLogSearchQuery({ query: '  nome  ', actor: ' renan ', entity: ' person- ' })).toBe(
      'nome renan person-',
    );
    expect(buildAuditLogSearchQuery({ actor: ' renan ', entity: ' person- ' })).toBe('renan person-');
    expect(
      buildAuditLogTypesenseFilter({
        actor: 'renan',
        entity: 'person-',
        entityType: AuditLogEntityType.PERSON,
        operation: AuditLogOperation.UPDATE,
        dateFrom,
        dateTo,
        revertedStatus: AuditLogExplorerRevertedStatus.NOT_REVERTED,
      }),
    ).toBe(
      [
        'entityType:=`PERSON`',
        'operation:=`UPDATE`',
        `lastRecordedAt:>=${Math.floor(dateFrom.getTime() / 1000)}`,
        `lastRecordedAt:<=${Math.floor(dateTo.getTime() / 1000)}`,
        'reverted:=false',
      ].join(' && '),
    );
  });

  it('builds SQL filters and rejects inverted date ranges', () => {
    expect(() =>
      assertValidAuditLogExplorerDateRange(new Date('2026-06-25T00:00:00.000Z'), new Date('2026-06-20T00:00:00.000Z')),
    ).toThrow(BadRequestException);

    expect(
      buildAuditLogSqlWhere({
        actor: 'renan',
        operation: AuditLogOperation.UPDATE,
        revertedStatus: AuditLogExplorerRevertedStatus.REVERTED,
      }),
    ).toEqual({
      AND: [
        { operation: AuditLogOperation.UPDATE },
        { revertedAt: { not: null } },
        {
          OR: [
            { actorId: { contains: 'renan', mode: Prisma.QueryMode.insensitive } },
            { actorName: { contains: 'renan', mode: Prisma.QueryMode.insensitive } },
            { actorEmail: { contains: 'renan', mode: Prisma.QueryMode.insensitive } },
          ],
        },
      ],
    });
  });
});
