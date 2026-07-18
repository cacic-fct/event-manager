import { AuditLogOperation } from '@prisma/client';
import { CertificateIssuanceRefresh } from './certificate-issuance-refresh';

describe('CertificateIssuanceRefresh', () => {
  it('refreshes each person configuration once while preserving its first-seen order', async () => {
    const prisma = transactionPrisma([
      { configId: 'config-1' },
      { configId: 'config-2' },
      { configId: 'config-1' },
    ]);
    const eligibility = {
      getConfigById: jest.fn(async (id: string) => ({ id })),
      resolveEligibleRecipients: jest.fn(async () => [{ person: { id: 'person-1' } }]),
    };
    const upsertCertificate = jest.fn(async (config: { id: string }) => ({
      certificate: { id: `certificate-${config.id}` },
      shouldNotify: false,
    }));
    const refresh = new CertificateIssuanceRefresh(
      prisma as never,
      { normalizeRequiredId: jest.fn((_field: string, value: string) => value) } as never,
      eligibility as never,
      upsertCertificate as never,
      { record: jest.fn(), resolveActor: jest.fn().mockResolvedValue(undefined) } as never,
    );

    await refresh.refreshForPerson('person-1', 'admin-1');

    expect(eligibility.getConfigById).toHaveBeenNthCalledWith(1, 'config-1');
    expect(eligibility.getConfigById).toHaveBeenNthCalledWith(2, 'config-2');
    expect(eligibility.getConfigById).toHaveBeenCalledTimes(2);
    expect(upsertCertificate).toHaveBeenCalledTimes(2);
  });

  it('delivers pending notifications only after a refresh transaction commits', async () => {
    const notifyCertificateAvailable = jest.fn().mockResolvedValue(undefined);
    const certificate = { id: 'certificate-1' };
    const prisma = transactionPrisma([{ configId: 'config-1' }]);
    prisma.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
      const result = await callback(prisma);
      expect(notifyCertificateAvailable).not.toHaveBeenCalled();
      return result;
    });
    const refresh = new CertificateIssuanceRefresh(
      prisma as never,
      { normalizeRequiredId: jest.fn((_field: string, value: string) => value) } as never,
      {
        getConfigById: jest.fn().mockResolvedValue({ id: 'config-1' }),
        resolveEligibleRecipients: jest.fn().mockResolvedValue([{ person: { id: 'person-1' } }]),
      } as never,
      jest.fn().mockResolvedValue({ certificate, shouldNotify: true }) as never,
      { record: jest.fn(), resolveActor: jest.fn().mockResolvedValue(undefined) } as never,
      notifyCertificateAvailable,
    );

    await expect(refresh.refreshForPerson('person-1')).resolves.toEqual([certificate]);
    expect(notifyCertificateAvailable).toHaveBeenCalledWith(certificate);
  });

  it('audits every active source certificate deleted after a people merge', async () => {
    const sourceCertificate = { id: 'certificate-1', personId: 'source-person', deletedAt: null };
    const prisma = transactionPrisma([], [sourceCertificate]);
    const audit = { record: jest.fn(), resolveActor: jest.fn().mockResolvedValue(undefined) };
    const refresh = new CertificateIssuanceRefresh(
      prisma as never,
      { normalizeRequiredId: jest.fn((_field: string, value: string) => value) } as never,
      {} as never,
      jest.fn() as never,
      audit as never,
    );

    await refresh.refreshAfterPeopleMerge('target-person', 'source-person', 'admin-1');

    expect(prisma.certificate.updateMany).toHaveBeenCalledWith({
      where: { personId: 'source-person', deletedAt: null },
      data: { deletedAt: expect.any(Date) },
    });
    expect(audit.record).toHaveBeenCalledWith(
      sourceCertificate,
      expect.objectContaining({ ...sourceCertificate, deletedAt: expect.any(Date) }),
      AuditLogOperation.DELETE,
      'admin-1',
      prisma,
      undefined,
    );
  });

  it('does not delete or audit when the source person has no active certificates after a people merge', async () => {
    const prisma = transactionPrisma([], []);
    const audit = { record: jest.fn(), resolveActor: jest.fn().mockResolvedValue(undefined) };
    const refresh = new CertificateIssuanceRefresh(
      prisma as never,
      { normalizeRequiredId: jest.fn((_field: string, value: string) => value) } as never,
      {} as never,
      jest.fn() as never,
      audit as never,
    );

    await refresh.refreshAfterPeopleMerge('target-person', 'source-person', 'admin-1');

    expect(prisma.certificate.updateMany).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});

function transactionPrisma(...findManyResults: unknown[]) {
  const prisma = {
    certificate: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
  };
  for (const result of findManyResults) {
    prisma.certificate.findMany.mockResolvedValueOnce(result);
  }
  return prisma;
}
