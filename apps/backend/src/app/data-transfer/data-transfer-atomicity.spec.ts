import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ResolvedTransferDocument,
  TransferApplyRequest,
  TransferDocument,
  TransferResource,
} from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import type { DataTransferAdapter, ResolvedTransferResource } from './data-transfer-adapter';
import { DataTransferService } from './data-transfer.service';
import { TransferKeyAllocations } from './transfer-key-allocations';
import { TransferValidationException } from './transfer-validation.exception';

const actor = { sub: 'organizer-1' } as AuthenticatedUser;

describe('data transfer commit safety', () => {
  it('refuses to write when the durable undo journal is unavailable', async () => {
    const fixture = createFixture();
    const service = new DataTransferService(
      fixture.prisma as never,
      fixture.authorization as never,
      {} as never,
      [fixture.adapter],
      fixture.allocations,
    );

    await expect(service.apply(applyRequest(document()), actor)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
  });

  it.each([
    { planHash: 'not-a-preview' },
    { allowPartial: 'yes' },
    { allocationToken: 'invalid-allocation' },
    { scope: { kind: 'person', id: 'person-1' } },
  ])('rejects invalid apply options before a transaction: %j', async (overrides) => {
    const fixture = createFixture();
    const request = { ...applyRequest(document()), ...overrides } as unknown as TransferApplyRequest;

    await expect(fixture.service.apply(request, actor)).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.prisma.$transaction).not.toHaveBeenCalled();
    expect(fixture.journal.findCommittedRequest).not.toHaveBeenCalled();
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
  });

  it('requires explicit partial consent and journals only the rows that were applied', async () => {
    const fixture = createFixture();
    const input = document('ready-event', 'blocked-event');
    jest.mocked(fixture.adapter.validate).mockImplementation(async (snapshot) => {
      if (snapshot.resource.id === 'blocked-event') throw new TransferValidationException('Evento bloqueado.');
    });
    const preview = await fixture.service.preview({ document: input }, actor);
    const request = { ...applyRequest(input), planHash: preview.planHash };

    await expect(fixture.service.apply(request, actor)).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
    expect(fixture.journal.begin).not.toHaveBeenCalled();

    const result = await fixture.service.apply({ ...request, allowPartial: true }, actor);
    expect(jest.mocked(fixture.adapter.apply).mock.calls.map(([snapshot]) => snapshot.resource.id)).toEqual([
      'ready-event',
    ]);
    expect(result.items).toEqual([
      expect.objectContaining({ id: 'ready-event', status: 'applied' }),
      expect.objectContaining({ id: 'blocked-event', status: 'blocked', action: 'skip' }),
    ]);
    expect(result.document.resources.map((resource) => resource.id)).toEqual(['ready-event']);
    expect(fixture.journal.record.mock.calls[0][4]).toEqual(result.document);
  });

  it('rejects a stale preview when an authorized related record changed', async () => {
    const fixture = createFixture();
    let revision = 'related-revision-before';
    jest.mocked(fixture.adapter.resolve).mockImplementation(async (resource) => ({
      ...snapshot(resource),
      relatedRevisions: [{ kind: 'group', id: 'related-group', revision }],
    }));
    const input = document();
    const preview = await fixture.service.preview({ document: input }, actor);
    revision = 'related-revision-after';

    await expect(
      fixture.service.apply({ ...applyRequest(input), planHash: preview.planHash }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
    expect(fixture.journal.begin).not.toHaveBeenCalled();
  });

  it('rejects an unchanged document instead of creating an empty undo batch', async () => {
    const fixture = createFixture();
    jest.mocked(fixture.adapter.resolve).mockImplementation(async (resource) => ({
      ...snapshot(resource),
      current: resource,
      revision: 'unchanged-revision',
    }));
    const input = document();
    const preview = await fixture.service.preview({ document: input }, actor);

    await expect(
      fixture.service.apply({ ...applyRequest(input), planHash: preview.planHash }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
    expect(fixture.journal.begin).not.toHaveBeenCalled();
  });

  it('rechecks row permissions after preview before any reversible write', async () => {
    const fixture = createFixture();
    const input = document();
    const preview = await fixture.service.preview({ document: input }, actor);
    jest.mocked(fixture.adapter.assertWrite).mockRejectedValue(new ForbiddenException('Permission revoked'));

    await expect(
      fixture.service.apply({ ...applyRequest(input), planHash: preview.planHash }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
    expect(fixture.journal.begin).not.toHaveBeenCalled();
  });

  it('blocks generated IDs that collide with stored resources instead of treating them as updates', async () => {
    const fixture = createFixture();
    jest
      .mocked(fixture.adapter.resolve)
      .mockImplementation(async (resource) => ({ ...snapshot(resource), current: resource }));

    const preview = await fixture.service.preview(
      {
        document: {
          format: 'cacic-event-data',
          version: 1,
          resources: [{ kind: 'event', key: 'NEW-EVENT', data: { name: 'Novo evento' } }],
        },
      },
      actor,
    );

    expect(preview.canApply).toBe(false);
    expect(preview.items).toEqual([
      expect.objectContaining({ key: 'NEW-EVENT', action: 'skip', status: 'blocked', changes: [] }),
    ]);
    expect(preview.items[0].message).toContain('ID gerado');
    expect(fixture.adapter.assertWrite).not.toHaveBeenCalled();
  });

  it('rejects distinct source rows that resolve to the same stored target', async () => {
    const fixture = createFixture();
    jest.mocked(fixture.adapter.resolve).mockImplementation(async (resource) => ({
      ...snapshot(resource),
      resolvedId: 'same-stored-event',
      identityKey: 'event:same-stored-event',
    }));

    await expect(fixture.service.preview({ document: document('source-a', 'source-b') }, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(fixture.adapter.apply).not.toHaveBeenCalled();
  });

  it('blocks an adapter that substitutes a different resource without exposing its data', async () => {
    const fixture = createFixture();
    jest.mocked(fixture.adapter.resolve).mockImplementation(async (resource) => ({
      ...snapshot(resource),
      resource: { ...resource, id: 'private-resource', data: { name: 'Private record' } } as TransferResource,
    }));
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const preview = await fixture.service.preview({ document: document() }, actor);

      expect(preview.canApply).toBe(false);
      expect(preview.items).toEqual([
        expect.objectContaining({ id: 'event-1', status: 'blocked', action: 'skip', changes: [] }),
      ]);
      expect(JSON.stringify(preview)).not.toContain('Private');
      expect(fixture.adapter.assertRead).not.toHaveBeenCalled();
      expect(fixture.adapter.apply).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });

  it.each(['audit', 'aggregate validation'] as const)(
    'does not publish effects or consume IDs when %s fails inside the write transaction',
    async (failurePoint) => {
      const fixture = createFixture();
      const publish = jest.fn().mockResolvedValue(undefined);
      jest.mocked(fixture.adapter.apply).mockResolvedValue({ postCommitEffects: [publish] });
      const input: TransferDocument = {
        format: 'cacic-event-data',
        version: 1,
        resources: [{ kind: 'event', key: 'NEW-EVENT', data: { name: 'Novo evento' } }],
      };
      const preview = await fixture.service.preview({ document: input }, actor);
      const allocation = preview.allocation;
      if (!allocation) throw new Error('A key-only import requires a server ID allocation.');
      const failure = new Error('Transaction must roll back');
      if (failurePoint === 'audit') fixture.journal.record.mockRejectedValue(failure);
      else fixture.adapter.validatePlan = jest.fn().mockRejectedValue(failure);

      await expect(
        fixture.service.apply(
          { ...applyRequest(input), planHash: preview.planHash, allocationToken: allocation.token },
          actor,
        ),
      ).rejects.toBe(failure);
      expect(publish).not.toHaveBeenCalled();
      expect(fixture.consume).not.toHaveBeenCalled();
      expect(fixture.recovery.recoverPending).not.toHaveBeenCalled();
      expect(fixture.allocations.apply(input, actor.sub, allocation.token).resources[0].id).toBe(
        allocation.ids['NEW-EVENT'],
      );
    },
  );

  it('publishes effects once after a serialization retry has committed', async () => {
    const fixture = createFixture();
    const published = jest.fn().mockResolvedValue(undefined);
    jest.mocked(fixture.adapter.apply).mockResolvedValue({ postCommitEffects: [published] });
    const input = document();
    const preview = await fixture.service.preview({ document: input }, actor);
    const calls: string[] = [];
    fixture.prisma.$transaction.mockImplementationOnce(async (operation) => {
      await operation(fixture.tx);
      calls.push('aborted');
      throw new Prisma.PrismaClientKnownRequestError('Serialization conflict', {
        code: 'P2034',
        clientVersion: 'test',
      });
    });
    fixture.prisma.$transaction.mockImplementationOnce(async (operation) => {
      const result = await operation(fixture.tx);
      calls.push('committed');
      return result;
    });
    published.mockImplementation(async () => {
      expect(calls).toEqual(['aborted', 'committed']);
    });

    const result = await fixture.service.apply({ ...applyRequest(input), planHash: preview.planHash }, actor);

    expect(result.applied).toBe(true);
    expect(fixture.adapter.apply).toHaveBeenCalledTimes(2);
    expect(published).toHaveBeenCalledTimes(1);
    expect(fixture.consume).toHaveBeenCalledTimes(1);
    expect(fixture.recovery.recoverPending).toHaveBeenCalledTimes(1);
  });

  it('continues remaining effects and recovers durable work after a post-commit effect fails', async () => {
    const fixture = createFixture();
    const failed = jest.fn().mockRejectedValue(new Error('Search unavailable'));
    const successful = jest.fn().mockResolvedValue(undefined);
    jest.mocked(fixture.adapter.apply).mockResolvedValue({ postCommitEffects: [failed, successful] });
    fixture.journal.synchronizationPending.mockResolvedValue(true);
    const input = document();
    const preview = await fixture.service.preview({ document: input }, actor);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const result = await fixture.service.apply({ ...applyRequest(input), planHash: preview.planHash }, actor);

      expect(result).toMatchObject({ applied: true, batchId: 'batch-1', synchronizationPending: true });
      expect(successful).toHaveBeenCalledTimes(1);
      expect(fixture.recovery.recoverPending).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});

function document(...ids: string[]): ResolvedTransferDocument {
  return {
    format: 'cacic-event-data',
    version: 1,
    resources: (ids.length ? ids : ['event-1']).map((id) => ({
      kind: 'event',
      id,
      data: { name: 'Evento importado' },
    })),
  };
}

function applyRequest(input: TransferDocument): TransferApplyRequest {
  return { document: input, planHash: '0'.repeat(64), allowPartial: false };
}

function snapshot(resource: TransferResource): ResolvedTransferResource {
  return { resource, current: null, revision: null, scope: { eventId: resource.id }, dependencies: [] };
}

function createFixture() {
  const tx = {} as Prisma.TransactionClient;
  const prisma = {
    $transaction: jest.fn(async (operation: (client: Prisma.TransactionClient) => Promise<unknown>) => operation(tx)),
  };
  const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const allocations = new TransferKeyAllocations();
  const consume = jest.spyOn(allocations, 'consume');
  const adapter: DataTransferAdapter = {
    kinds: ['event'],
    dependencyOrder: 10,
    resolve: jest.fn(async (resource) => snapshot(resource)),
    assertRead: jest.fn().mockResolvedValue(undefined),
    assertWrite: jest.fn().mockResolvedValue(undefined),
    assertMutable: jest.fn().mockResolvedValue(undefined),
    validate: jest.fn().mockResolvedValue(undefined),
    apply: jest.fn().mockResolvedValue({}),
    exportTarget: jest.fn().mockResolvedValue({ resources: [], issues: [] }),
  };
  const journal = {
    findCommittedRequest: jest.fn().mockResolvedValue(null),
    lockRequest: jest.fn().mockResolvedValue(undefined),
    begin: jest.fn(() => ({ tx, setSource: jest.fn() })),
    record: jest.fn<Promise<{ batchId: string; auditEntryId: string }>, unknown[]>().mockResolvedValue({
      batchId: 'batch-1',
      auditEntryId: 'batch-1',
    }),
    synchronizationPending: jest.fn().mockResolvedValue(false),
  };
  const recovery = { recoverPending: jest.fn().mockResolvedValue(undefined) };
  const service = new DataTransferService(
    prisma as never,
    authorization as never,
    {} as never,
    [adapter],
    allocations,
    journal as never,
    recovery as never,
  );
  return { service, prisma, adapter, journal, recovery, allocations, consume, authorization, tx };
}
