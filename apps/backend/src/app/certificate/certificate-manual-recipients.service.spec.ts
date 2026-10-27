import { CertificateIssuedTo, CertificateScope } from '@cacic-fct/shared-data-types';
import { AuditLogOperation } from '@prisma/client';
import { CertificateManualRecipientsService } from './certificate-manual-recipients.service';
import { CertificateIssuingService } from './certificate-issuing.service';
const { jest } = import.meta;

function fixture() {
  const now = new Date();
  const person = { id: 'person', name: 'Pessoa', deletedAt: null };
  const config = {
    id: 'config',
    name: 'Certificado manual',
    scope: CertificateScope.OTHER,
    issuedTo: CertificateIssuedTo.OTHER,
    certificateTemplateId: 'template',
    certificateTemplate: { id: 'template', name: 'Modelo', isActive: true },
    folderId: 'folder',
    folder: { id: 'folder', name: 'Pasta' },
    isActive: true,
    certificateFields: null,
    shouldAutofillSecondPage: false,
  };
  const certificate = {
    id: 'original-certificate',
    configId: config.id,
    personId: person.id,
    config,
    person,
    certificateTemplateId: 'template',
    certificateTemplate: config.certificateTemplate,
    renderedData: {},
    issuedAt: new Date(now.getTime() - 60_000),
    deletedAt: null as Date | null,
    revokedAt: null as Date | null,
    revokedById: null as string | null,
    revocationReason: null as string | null,
  };
  const membership = {
    configId: config.id,
    personId: person.id,
    person,
    createdAt: now,
    removedAt: null as Date | null,
  };
  const prisma = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(prisma)),
    user: { findUnique: jest.fn().mockResolvedValue({ name: 'Admin', email: null }) },
    people: { findFirst: jest.fn().mockResolvedValue(person) },
    certificateConfig: { findUniqueOrThrow: jest.fn().mockResolvedValue(config) },
    certificateManualRecipient: {
      findUnique: jest.fn(async () => ({ ...membership })),
      findMany: jest.fn(async () => (membership.removedAt ? [] : [{ ...membership }])),
      upsert: jest.fn(async ({ update }: { update: Partial<typeof membership> }) => Object.assign(membership, update)),
    },
    certificate: {
      findUnique: jest.fn(async () => ({ ...certificate })),
      findMany: jest.fn(async () => [{ ...certificate }]),
      update: jest.fn(async ({ data }: { data: Partial<typeof certificate> }) => ({
        ...Object.assign(certificate, data),
      })),
      create: jest.fn(),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    supersedeCertificateNotifications: jest.fn(),
    createPendingOutbox: jest.fn(),
    enqueue: jest.fn(),
  };
  const eligibility = {
    getConfigById: jest.fn().mockResolvedValue(config),
    resolveEligibleRecipients: jest.fn().mockResolvedValue([{ person, events: [] }]),
  };
  const service = new CertificateManualRecipientsService(
    prisma as never,
    eligibility as never,
    notifications as never,
    audit as never,
  );
  const issuing = new CertificateIssuingService(
    prisma as never,
    {
      normalizeRequiredId: (_name: string, value: string) => value,
    } as never,
    eligibility as never,
    undefined,
    audit as never,
    notifications as never,
  );
  return { service, issuing, prisma, membership, certificate, audit, notifications, config };
}

describe('manual certificate recipient lifecycle', () => {
  it('revokes removal atomically, suppresses notifications, and excludes future reissuance', async () => {
    const { service, issuing, membership, certificate, prisma, notifications, audit } = fixture();
    await service.remove('config', 'person', 'admin');
    expect(membership.removedAt).toBeInstanceOf(Date);
    expect(certificate).toEqual(
      expect.objectContaining({
        id: 'original-certificate',
        deletedAt: expect.any(Date),
        revokedAt: expect.any(Date),
        revocationReason: 'MANUAL_RECIPIENT_REMOVED',
      }),
    );
    await expect(issuing.issueMissedCertificates('config')).resolves.toEqual([]);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
    expect(notifications.supersedeCertificateNotifications).toHaveBeenCalledWith(certificate.id, prisma);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.DELETE, entityId: certificate.id }),
      prisma,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.UNDO,
        metadata: expect.objectContaining({ included: false }),
      }),
      prisma,
    );
  });

  it('restores eligibility on re-add and reuses the old certificate ID on the next issuance', async () => {
    const { service, issuing, certificate, membership, prisma, audit } = fixture();
    await service.remove('config', 'person', 'admin');
    await service.add('config', 'person', 'admin');
    expect(membership.removedAt).toBeNull();
    expect(certificate.revokedAt).toBeNull();
    expect(certificate.deletedAt).toBeInstanceOf(Date);
    const issued = await issuing.issueMissedCertificates('config');
    expect(issued.map((item) => item.id)).toEqual(['original-certificate']);
    expect(certificate.deletedAt).toBeNull();
    expect(prisma.certificate.create).not.toHaveBeenCalled();
    expect(prisma.certificate.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { id: certificate.id, revokedAt: null } }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: AuditLogOperation.ASSIGN,
        metadata: expect.objectContaining({ included: true }),
      }),
      prisma,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.REISSUE, entityId: certificate.id }),
      prisma,
    );
  });

  it('keeps an independent admin revocation when a removed recipient is added again', async () => {
    const { service, certificate, issuing } = fixture();
    certificate.revokedAt = new Date();
    certificate.deletedAt = new Date();
    certificate.revocationReason = 'ADMIN';
    await service.remove('config', 'person', 'admin');
    await service.add('config', 'person', 'admin');
    expect(certificate.revokedAt).toBeInstanceOf(Date);
    expect(certificate.revocationReason).toBe('ADMIN');
    await expect(issuing.issueMissedCertificates('config')).resolves.toEqual([]);
  });

  it('retains the removal tombstone for a stale issuance worker even when no certificate exists yet', async () => {
    const { service, issuing, prisma } = fixture();
    prisma.certificate.findUnique.mockResolvedValue(null as never);
    await service.remove('config', 'person', 'admin');
    await expect(issuing.issueForPerson('config', 'person', 'admin')).rejects.toThrow('Adicione a pessoa novamente');
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });
});
