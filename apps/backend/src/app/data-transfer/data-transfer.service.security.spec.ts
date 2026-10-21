import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { TransferResource } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DataTransferService } from './data-transfer.service';
import type { DataTransferAdapter, ResolvedTransferResource } from './data-transfer-adapter';
import { TransferKeyAllocations } from './transfer-key-allocations';
import { TransferValidationException } from './transfer-validation.exception';
const { jest } = import.meta;

describe('DataTransferService security gates', () => {
  it('returns authored validation guidance while keeping unexpected domain details private', async () => {
    const adapter = createAdapter();
    const validate = jest.mocked(adapter.validate);
    validate.mockRejectedValueOnce(new TransferValidationException('Informe a data de início do evento.'));
    const service = createService({ adapters: [adapter] });
    const preview = await service.preview({ document: eventDocument() }, user());
    expect(preview.items[0]).toMatchObject({ status: 'blocked', message: 'Informe a data de início do evento.' });

    validate.mockRejectedValueOnce(new BadRequestException('Private owning-service details'));
    const masked = await service.preview({ document: eventDocument() }, user());
    expect(masked.items[0].message).toBe('A alteração não atende às regras atuais deste recurso.');
    expect(JSON.stringify(masked)).not.toContain('Private');
  });
  it('serves the schema to an import-only organizer', async () => {
    const authorization = {
      grantedPermissionSet: jest.fn().mockResolvedValue(new Set([Permission.DataTransfer.Import])),
    };
    const service = createService({ authorization });

    await expect(service.getSchema(user())).resolves.toEqual(
      expect.objectContaining({ $id: 'urn:cacic:event-data:v1' }),
    );
  });

  it('does not open a transaction when the import gate denies access', async () => {
    const prisma = { $transaction: jest.fn() };
    const authorization = { assertPermissions: jest.fn().mockRejectedValue(new ForbiddenException()) };
    const journal = { begin: jest.fn(), record: jest.fn(), findCommittedRequest: jest.fn() };
    const service = createService({ prisma, authorization, journal });

    await expect(
      service.apply(
        {
          document: eventDocument(),
          planHash: '0'.repeat(64),
          allowPartial: false,
        },
        user(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(journal.findCommittedRequest).not.toHaveBeenCalled();
  });

  it('rejects unknown resource data fields before it resolves any records', async () => {
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const adapter = createAdapter();
    const service = createService({ authorization, adapters: [adapter] });
    const document = eventDocument();
    const resource = document.resources[0];
    if (!resource) throw new Error('Test document needs an event resource.');
    resource.data['publicationUpdatedBy'] = 'forged-user';

    await expect(service.preview({ document }, user())).rejects.toBeInstanceOf(BadRequestException);
    expect(adapter.resolve).not.toHaveBeenCalled();
  });

  it('rechecks the plan hash before beginning reversible writes', async () => {
    const tx = {};
    const prisma = { $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(tx)) };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const adapter = createAdapter();
    const journal = { begin: jest.fn(), record: jest.fn(), findCommittedRequest: jest.fn().mockResolvedValue(null) };
    const service = createService({ prisma, authorization, adapters: [adapter], journal });

    await expect(
      service.apply(
        {
          document: eventDocument(),
          planHash: '0'.repeat(64),
          allowPartial: true,
        },
        user(),
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(adapter.apply).not.toHaveBeenCalled();
    expect(journal.begin).not.toHaveBeenCalled();
  });
});

function createService(input: {
  prisma?: Record<string, unknown>;
  authorization?: Record<string, unknown>;
  adapters?: DataTransferAdapter[];
  journal?: Record<string, unknown>;
}) {
  const prisma = input.prisma ?? {
    $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
  };
  const authorization = input.authorization ?? {
    assertPermissions: jest.fn().mockResolvedValue(undefined),
    grantedPermissionSet: jest.fn().mockResolvedValue(new Set([Permission.DataTransfer.Import])),
  };
  const adapters = input.adapters ?? [];
  const journal = input.journal ?? {
    begin: jest.fn(),
    record: jest.fn(),
    findCommittedRequest: jest.fn().mockResolvedValue(null),
  };
  return new DataTransferService(
    prisma as never,
    authorization as never,
    {} as never,
    adapters,
    new TransferKeyAllocations(),
    journal as never,
  );
}

function createAdapter(): DataTransferAdapter {
  const adapter: DataTransferAdapter = {
    kinds: ['event'],
    dependencyOrder: 10,
    resolve: jest.fn(
      async (resource: TransferResource): Promise<ResolvedTransferResource> => ({
        resource,
        current: null,
        revision: null,
        scope: { eventId: resource.id },
        dependencies: [],
      }),
    ),
    assertRead: jest.fn().mockResolvedValue(undefined),
    assertWrite: jest.fn().mockResolvedValue(undefined),
    assertMutable: jest.fn().mockResolvedValue(undefined),
    validate: jest.fn().mockResolvedValue(undefined),
    apply: jest.fn().mockResolvedValue({}),
    exportTarget: jest.fn().mockResolvedValue({ resources: [], issues: [] }),
  };
  return adapter;
}

function user(): AuthenticatedUser {
  return { sub: 'organizer-1' } as AuthenticatedUser;
}

function eventDocument() {
  return {
    format: 'cacic-event-data',
    version: 1,
    resources: [{ kind: 'event', id: 'event-1', data: { name: 'Test event' } }],
  } as unknown as {
    format: string;
    version: number;
    resources: Array<{ kind: string; id: string; data: Record<string, unknown> }>;
  };
}
