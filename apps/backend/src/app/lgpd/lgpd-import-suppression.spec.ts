import { Prisma } from '@prisma/client';
import { suppressErasedImportPeople } from './lgpd-import-suppression';

const secret = 'test-import-suppression-secret-32-bytes';
const keyFingerprint = '587a12640167a89239754a8e833c124827a58af8a30cf743c0d5497d93f533d3';
const personToken = 'd620b7c7e87884108467a7c26dc1dcea5740e8902157845b8c376e3297708f59';

describe('erased import suppression', () => {
  const originalSecret = process.env['LGPD_IMPORT_SUPPRESSION_SECRET'];

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env['LGPD_IMPORT_SUPPRESSION_SECRET'];
    } else {
      process.env['LGPD_IMPORT_SUPPRESSION_SECRET'] = originalSecret;
    }
  });

  function transaction(existingKey: string | null = null) {
    const records = [
      { sourceNamespace: 'evcomp', entityType: 'person', sourceId: '10', targetId: 'erased-person' },
      { sourceNamespace: 'evcomp', entityType: 'person', sourceId: '20', targetId: 'other-person' },
      { sourceNamespace: 'evcomp', entityType: 'event', sourceId: '10', targetId: 'erased-person' },
    ];
    const delegate = {
      findMany: jest.fn().mockImplementation(async () => records.filter((row) => row.entityType === 'person' && row.targetId === 'erased-person')),
      findUnique: jest.fn().mockResolvedValue(existingKey ? { targetId: existingKey } : null),
      findFirst: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockImplementation(async ({ create }) => {
        records.push(create);
        return create;
      }),
      createMany: jest.fn().mockImplementation(async ({ data }) => {
        records.push(...data);
        return { count: data.length };
      }),
      deleteMany: jest.fn().mockImplementation(async () => {
        const index = records.findIndex((row) => row.entityType === 'person' && row.targetId === 'erased-person');
        records.splice(index, 1);
        return { count: 1 };
      }),
    };
    const orphanQuery = jest.fn().mockResolvedValue([]);
    const tx = { externalImportRecord: delegate, $executeRaw: jest.fn().mockResolvedValue(1), $queryRaw: orphanQuery };
    return { tx: tx as unknown as Prisma.TransactionClient, delegate, records, orphanQuery };
  }

  it('replaces source and local identifiers with tokens compatible with the importer', async () => {
    process.env['LGPD_IMPORT_SUPPRESSION_SECRET'] = secret;
    const { tx, delegate, records } = transaction();
    await expect(suppressErasedImportPeople(tx, ['erased-person'])).resolves.toBe(1);

    expect(records).toContainEqual({
      sourceNamespace: 'evcomp', entityType: 'person_suppression', sourceId: personToken, targetId: 'suppressed',
    });
    expect(records).toContainEqual({
      sourceNamespace: 'evcomp', entityType: 'person_suppression_key', sourceId: 'v1', targetId: keyFingerprint,
    });
    expect(records).not.toContainEqual(expect.objectContaining({ entityType: 'person', sourceId: '10' }));
    expect(records).toContainEqual(expect.objectContaining({ entityType: 'person', targetId: 'other-person' }));
    expect(records).toContainEqual(expect.objectContaining({ entityType: 'event', sourceId: '10' }));
    expect(delegate.createMany.mock.invocationCallOrder[0]).toBeLessThan(delegate.deleteMany.mock.invocationCallOrder[0]);
  });

  it.each([undefined, 'short'])('rejects erasure without a sufficiently strong secret (%s)', async (value) => {
    if (value === undefined) delete process.env['LGPD_IMPORT_SUPPRESSION_SECRET'];
    else process.env['LGPD_IMPORT_SUPPRESSION_SECRET'] = value;
    const { tx, delegate } = transaction();
    await expect(suppressErasedImportPeople(tx, ['erased-person'])).rejects.toThrow('at least 32 bytes');
    expect(delegate.deleteMany).not.toHaveBeenCalled();
    expect(delegate.upsert).not.toHaveBeenCalled();
  });

  it('rejects key changes instead of invalidating existing suppression tokens', async () => {
    process.env['LGPD_IMPORT_SUPPRESSION_SECRET'] = secret;
    const { tx, delegate } = transaction('different-key-fingerprint');
    await expect(suppressErasedImportPeople(tx, ['erased-person'])).rejects.toThrow('does not match');
    expect(delegate.deleteMany).not.toHaveBeenCalled();
    expect(delegate.upsert).not.toHaveBeenCalled();
  });

  it('does not require a suppression secret for people with no import mappings', async () => {
    delete process.env['LGPD_IMPORT_SUPPRESSION_SECRET'];
    const { tx, delegate } = transaction();
    delegate.findMany.mockResolvedValue([]);
    await expect(suppressErasedImportPeople(tx, ['ordinary-person'])).resolves.toBe(0);
    expect(delegate.upsert).not.toHaveBeenCalled();
  });

  it('fails closed if suppression tokens exist without a key fingerprint', async () => {
    process.env['LGPD_IMPORT_SUPPRESSION_SECRET'] = secret;
    const { tx, delegate } = transaction();
    delegate.findFirst.mockResolvedValue({ sourceId: 'unverifiable-token' });
    await expect(suppressErasedImportPeople(tx, ['erased-person'])).rejects.toThrow('no verifiable key');
    expect(delegate.upsert).not.toHaveBeenCalled();
    expect(delegate.deleteMany).not.toHaveBeenCalled();
  });

  it('scrubs historical orphan mappings even when the data subject no longer exists', async () => {
    process.env['LGPD_IMPORT_SUPPRESSION_SECRET'] = secret;
    const { tx, delegate, records, orphanQuery } = transaction();
    delegate.findMany.mockResolvedValue([]);
    orphanQuery.mockResolvedValue([records[0]]);
    await expect(suppressErasedImportPeople(tx, [])).resolves.toBe(1);
    expect(records).toContainEqual(expect.objectContaining({ entityType: 'person_suppression', sourceId: personToken }));
    expect(records).not.toContainEqual(expect.objectContaining({ entityType: 'person', sourceId: '10' }));
  });
});
