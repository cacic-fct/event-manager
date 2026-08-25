import { Permission } from '@cacic-fct/shared-permissions';
import { NotFoundException } from '@nestjs/common';
import { AuditLogOperation } from '@prisma/client';
import { REQUIRED_PERMISSIONS_KEY } from '../../auth/auth.constants';
import { MergeCandidatesResolver } from './resolver';

describe('MergeCandidatesResolver', () => {
  const actor = { sub: 'admin-1' };
  const mergeCandidate = {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    mergeCandidate,
    $transaction: jest.fn(async (operation: (tx: { mergeCandidate: typeof mergeCandidate }) => Promise<unknown>) =>
      operation({ mergeCandidate }),
    ),
  };
  const operations = {
    scanMergeCandidates: jest.fn(),
    mergeCandidatePeople: jest.fn(),
    undoMergeCandidatePeople: jest.fn(),
  };
  const auditLog = { record: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    auditLog.record.mockResolvedValue(undefined);
  });

  it('guards every query and mutation with its exact permission', () => {
    expect(permissionFor('mergeCandidates')).toEqual([Permission.MergeCandidate.Read]);
    expect(permissionFor('mergeCandidate')).toEqual([Permission.MergeCandidate.Read]);
    expect(permissionFor('createMergeCandidate')).toEqual([Permission.MergeCandidate.Create]);
    expect(permissionFor('updateMergeCandidate')).toEqual([Permission.MergeCandidate.Update]);
    expect(permissionFor('scanMergeCandidates')).toEqual([Permission.MergeCandidate.Scan]);
    expect(permissionFor('mergeCandidatePeople')).toEqual([Permission.MergeCandidate.Merge]);
    expect(permissionFor('undoMergeCandidatePeople')).toEqual([Permission.MergeCandidate.Undo]);
    expect(permissionFor('deleteMergeCandidate')).toEqual([Permission.MergeCandidate.Delete]);
  });

  it('lists actionable pending candidates with pagination and loads a candidate with people', async () => {
    const candidate = candidateFixture();
    mergeCandidate.findMany.mockResolvedValueOnce([candidate]);
    mergeCandidate.findUnique.mockResolvedValueOnce(candidate);

    await expect(resolver().mergeCandidates('PENDING' as never, 5, 20)).resolves.toEqual([candidate]);
    expect(mergeCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'PENDING' }),
        include: { personA: true, personB: true },
        orderBy: { updatedAt: 'desc' },
        skip: 5,
        take: 20,
      }),
    );
    await expect(resolver().mergeCandidate('candidate-1')).resolves.toBe(candidate);
    expect(mergeCandidate.findUnique).toHaveBeenCalledWith({
      where: { id: 'candidate-1' },
      include: { personA: true, personB: true },
    });
  });

  it('rejects a missing candidate lookup', async () => {
    mergeCandidate.findUnique.mockResolvedValueOnce(null);

    await expect(resolver().mergeCandidate('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates and audits a candidate with the request actor fallback', async () => {
    const candidate = candidateFixture();
    mergeCandidate.create.mockResolvedValueOnce(candidate);

    await expect(
      resolver().createMergeCandidate(
        {
          personAId: 'person-a',
          personBId: 'person-b',
          pairKey: 'person-a:person-b',
          score: 0.9,
          status: 'PENDING',
        } as never,
        { request: { user: actor } } as never,
      ),
    ).resolves.toBe(candidate);

    expect(mergeCandidate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        personA: { connect: { id: 'person-a' } },
        personB: { connect: { id: 'person-b' } },
        pairKey: 'person-a:person-b',
        createdById: 'admin-1',
        updatedById: 'admin-1',
      }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.CREATE, actor }),
      expect.anything(),
    );
  });

  it('reopens and resolves candidate statuses with the correct resolver attribution', async () => {
    const existing = candidateFixture({ status: 'REJECTED', resolvedById: 'other-admin' });
    mergeCandidate.findUnique.mockResolvedValue(existing);
    mergeCandidate.update.mockResolvedValue(candidateFixture({ status: 'PENDING', resolvedById: null }));

    await resolver().updateMergeCandidate(
      'candidate-1',
      { status: 'PENDING' } as never,
      { req: { user: actor } } as never,
    );
    expect(mergeCandidate.update).toHaveBeenLastCalledWith({
      where: { id: 'candidate-1' },
      data: expect.objectContaining({ status: 'PENDING', resolvedById: null, updatedById: 'admin-1' }),
    });

    mergeCandidate.update.mockResolvedValueOnce(candidateFixture({ status: 'MERGED', resolvedById: 'admin-1' }));
    await resolver().updateMergeCandidate(
      'candidate-1',
      { status: 'MERGED' } as never,
      { req: { user: actor } } as never,
    );
    expect(mergeCandidate.update).toHaveBeenLastCalledWith({
      where: { id: 'candidate-1' },
      data: expect.objectContaining({ status: 'MERGED', resolvedById: 'admin-1', updatedById: 'admin-1' }),
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.UPDATE, before: existing }),
      expect.anything(),
    );
  });

  it('delegates scan, merge, and undo operations with the authenticated actor id', async () => {
    operations.scanMergeCandidates.mockResolvedValueOnce(3);
    operations.mergeCandidatePeople.mockResolvedValueOnce(candidateFixture({ status: 'MERGED' }));
    operations.undoMergeCandidatePeople.mockResolvedValueOnce(candidateFixture({ status: 'PENDING' }));
    const input = { candidateId: 'candidate-1', keepPersonId: 'person-a' };
    const subject = resolver();

    await expect(subject.scanMergeCandidates({ req: { user: actor } } as never)).resolves.toBe(3);
    await subject.mergeCandidatePeople(input as never, { req: { user: actor } } as never);
    await subject.undoMergeCandidatePeople('candidate-1', { req: { user: actor } } as never);

    expect(operations.scanMergeCandidates).toHaveBeenCalledWith('admin-1');
    expect(operations.mergeCandidatePeople).toHaveBeenCalledWith(input, 'admin-1');
    expect(operations.undoMergeCandidatePeople).toHaveBeenCalledWith('candidate-1', 'admin-1');
  });

  it('deletes and audits an existing candidate, and rejects a missing one', async () => {
    const candidate = candidateFixture();
    mergeCandidate.findUnique.mockResolvedValueOnce(candidate);

    await expect(resolver().deleteMergeCandidate('candidate-1', { req: { user: actor } } as never)).resolves.toEqual({
      deleted: true,
      id: 'candidate-1',
    });
    expect(mergeCandidate.delete).toHaveBeenCalledWith({ where: { id: 'candidate-1' } });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.DELETE, before: candidate, actor }),
      expect.anything(),
    );

    mergeCandidate.findUnique.mockResolvedValueOnce(null);
    await expect(resolver().deleteMergeCandidate('missing', { req: { user: actor } } as never)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  function resolver(): MergeCandidatesResolver {
    return new MergeCandidatesResolver(prisma as never, operations as never, auditLog as never);
  }
});

function permissionFor(operation: keyof MergeCandidatesResolver): unknown {
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, MergeCandidatesResolver.prototype[operation]);
}

function candidateFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'candidate-1',
    personAId: 'person-a',
    personBId: 'person-b',
    pairKey: 'person-a:person-b',
    score: 0.9,
    status: 'PENDING',
    resolvedById: null,
    personA: { id: 'person-a' },
    personB: { id: 'person-b' },
    ...overrides,
  };
}
