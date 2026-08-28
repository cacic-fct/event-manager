import { AuditLogOperation } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CertificateIssuanceAudit } from './certificate-issuance-audit';

describe('CertificateIssuanceAudit', () => {
  it('does not record a reissue when only ignored bookkeeping fields changed', async () => {
    const prisma = {
      auditLogEntry: {
        create: jest.fn(),
      },
    };
    const audit = new CertificateIssuanceAudit(new AuditLogService(prisma as never, {} as never));
    const before = {
      id: 'certificate-1',
      person: { name: 'Ana Silva' },
      config: {
        name: 'Participacao',
        eventId: 'event-1',
        eventGroupId: null,
        majorEventId: null,
      },
      renderedData: { person: { name: 'Ana Silva' } },
      updatedAt: new Date('2026-08-28T12:00:00.000Z'),
    };

    await audit.record(
      before as never,
      { ...before, updatedAt: new Date('2026-08-28T12:01:00.000Z') } as never,
      AuditLogOperation.REISSUE,
      undefined,
      prisma as never,
    );

    expect(prisma.auditLogEntry.create).not.toHaveBeenCalled();
  });
});
