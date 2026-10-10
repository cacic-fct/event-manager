import { AuditLogOperation } from '@prisma/client';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CertificateIssuanceAudit } from './certificate-issuance-audit';

describe('CertificateIssuanceAudit', () => {
  it('does not record a reissue when only ignored bookkeeping fields changed', async () => {
    const updatedAt = new Date();
    const prisma = {
      auditLogEntry: {
        create: jest.fn(),
      },
    };
    const audit = new CertificateIssuanceAudit(
      new AuditLogService(prisma as never, {} as never, { refreshForEvent: jest.fn() } as never),
    );
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
      updatedAt,
    };

    await audit.record(
      before as never,
      { ...before, updatedAt: new Date(updatedAt.getTime() + 60_000) } as never,
      AuditLogOperation.REISSUE,
      undefined,
      prisma as never,
    );

    expect(prisma.auditLogEntry.create).not.toHaveBeenCalled();
  });

  it('records changed rendered content as a flag without storing the rendered data', async () => {
    const prisma = {
      auditLogEntry: {
        create: jest.fn().mockResolvedValue({ id: 'audit-entry-1' }),
      },
    };
    const audit = new CertificateIssuanceAudit(
      new AuditLogService(prisma as never, {} as never, {} as never),
    );
    const before = {
      id: 'certificate-1',
      personId: 'person-1',
      person: { name: 'Ana Silva' },
      configId: 'config-1',
      config: {
        name: 'Participação',
        eventId: 'event-1',
        eventGroupId: null,
        majorEventId: null,
      },
      certificateTemplateId: 'template-1',
      issuedAt: new Date(),
      issuedById: 'admin-1',
      deletedAt: null,
      renderedData: { person: { name: 'Ana Silva' }, secret: 'old rendered content' },
    };
    const after = {
      ...before,
      issuedAt: new Date(before.issuedAt.getTime() + 60_000),
      renderedData: { person: { name: 'Ana Silva' }, secret: 'new rendered content' },
    };

    await audit.record(before as never, after as never, AuditLogOperation.REISSUE, undefined, prisma as never);

    expect(prisma.auditLogEntry.create).toHaveBeenCalledTimes(1);
    const data = prisma.auditLogEntry.create.mock.calls[0][0].data;
    expect(data.metadata).toEqual({ renderedDataChanged: true });
    expect(data.before).not.toHaveProperty('renderedData');
    expect(data.after).not.toHaveProperty('renderedData');
    expect(JSON.stringify(data)).not.toContain('rendered content');
  });
});
