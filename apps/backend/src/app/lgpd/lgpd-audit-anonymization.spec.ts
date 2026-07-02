import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TypesenseSearchService } from '../search/typesense-search.service';
import { synchronizeAnonymizedAuditEntries } from './lgpd-audit-anonymization';
import { LgpdService } from './lgpd.service';
import {
  createLgpdServiceTestContext,
  LgpdServiceTestContext,
  restoreLgpdServiceTestContext,
} from './lgpd.service.spec-support';

describe('synchronizeAnonymizedAuditEntries', () => {
  let context: LgpdServiceTestContext;

  beforeEach(() => {
    context = createLgpdServiceTestContext();
  });

  afterEach(() => {
    restoreLgpdServiceTestContext();
  });

  it('does not fail anonymization when Typesense rejects an audit-log reindex', async () => {
    const { prisma, typesenseSearch } = context;
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    prisma.auditLogEntry.findMany.mockResolvedValue([{ id: 'audit-1', entityLabel: 'Dados anonimizados' }]);
    typesenseSearch.upsertAuditLogEntry.mockRejectedValueOnce(new Error('typesense down'));

    await expect(
      synchronizeAnonymizedAuditEntries(
        prisma as unknown as PrismaService,
        typesenseSearch as unknown as TypesenseSearchService,
        new Logger(LgpdService.name),
        ['audit-1'],
      ),
    ).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith('Falha ao reindexar audit log anonimizado audit-1: typesense down');
  });
});
