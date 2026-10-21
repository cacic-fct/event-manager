import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EventManagerPermissionScope } from '@prisma/client';
import { EventManagerKeycloakRole, Permission } from '@cacic-fct/shared-permissions';
import type { TransferResource } from '@cacic-fct/shared-data-transfer';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { findActiveRolePermissionScopes, type EffectiveRoleScope } from '../authorization/effective-role-scopes';
import type { ResolvedTransferResource, TransferAdapterContext } from './data-transfer-adapter';
import { ConfigurationTransferAdapter } from './configuration-transfer.adapter';
import { DataTransferService } from './data-transfer.service';
import { EventTreeTransferAdapter } from './event-tree-transfer.adapter';
import { TransferKeyAllocations } from './transfer-key-allocations';

jest.mock('../authorization/effective-role-scopes', () => ({ findActiveRolePermissionScopes: jest.fn() }));
const activeScopes = jest.mocked(findActiveRolePermissionScopes);

const cases = [
  {
    kind: 'event',
    scope: { eventId: 'target-b' },
    permissionScope: EventManagerPermissionScope.EVENT,
    read: Permission.Event.Read,
    write: Permission.Event.Update,
  },
  {
    kind: 'group',
    scope: { eventGroupId: 'target-b' },
    permissionScope: EventManagerPermissionScope.EVENT_GROUP,
    read: Permission.EventGroup.Read,
    write: Permission.EventGroup.Update,
  },
  {
    kind: 'major-event',
    scope: { majorEventId: 'target-b' },
    permissionScope: EventManagerPermissionScope.MAJOR_EVENT,
    read: Permission.MajorEvent.Read,
    write: Permission.MajorEvent.Update,
  },
  {
    kind: 'event-form',
    scope: { eventId: 'target-b' },
    permissionScope: EventManagerPermissionScope.EVENT,
    read: Permission.EventForm.Read,
    write: Permission.EventForm.Update,
  },
  {
    kind: 'form-link',
    scope: { eventId: 'target-b' },
    permissionScope: EventManagerPermissionScope.EVENT,
    read: Permission.EventForm.Read,
    write: Permission.EventForm.Update,
  },
  {
    kind: 'ticket-config',
    scope: { eventId: 'target-b' },
    permissionScope: EventManagerPermissionScope.EVENT,
    read: Permission.TicketConfig.Read,
    write: Permission.TicketConfig.Update,
  },
] as const;

describe.each(cases)('$kind import scope enforcement', (testCase) => {
  const actor = { sub: 'organizer-1', roleSet: new Set([EventManagerKeycloakRole.Access]) } as AuthenticatedUser;

  function harness(importTargetId: string) {
    const prisma = {
      event: {
        findUnique: jest.fn().mockResolvedValue({ eventGroupId: null, majorEventId: null }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      eventGroup: {
        findUnique: jest.fn().mockResolvedValue({ majorEventId: null }),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      eventForm: {
        findFirst: jest.fn().mockResolvedValue({ ownerEventId: 'target-b', ownerMajorEventId: null, links: [] }),
      },
      $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation({})),
    };
    const authorization = new AuthorizationPolicyService(prisma as never);
    const grants = (targetId: string): EffectiveRoleScope[] => [
      {
        permission: Permission.DataTransfer.Import,
        scope: testCase.permissionScope,
        eventId: testCase.permissionScope === 'EVENT' ? targetId : null,
        eventGroupId: testCase.permissionScope === 'EVENT_GROUP' ? targetId : null,
        majorEventId: testCase.permissionScope === 'MAJOR_EVENT' ? targetId : null,
      },
      ...[testCase.read, testCase.write].map((permission) => ({
        permission,
        scope: EventManagerPermissionScope.GLOBAL,
        eventId: null,
        eventGroupId: null,
        majorEventId: null,
      })),
    ];
    const setImportTarget = (targetId: string) => {
      activeScopes.mockImplementation(async (_prisma, _actorId, permissions) =>
        grants(targetId).filter((grant) => !permissions || permissions.includes(grant.permission)),
      );
    };
    setImportTarget(importTargetId);
    const eventTree = ['event', 'group', 'major-event'].includes(testCase.kind);
    // Domain writers are unused: this harness exercises the real adapter and policy authorization.
    const unused = {} as never;
    const dependencies = [
      unused,
      authorization,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    ] as const;
    const adapter = eventTree
      ? new EventTreeTransferAdapter(...dependencies)
      : new ConfigurationTransferAdapter(...dependencies);
    const resource = { kind: testCase.kind, id: 'resource-b', data: {} } as TransferResource;
    const snapshot: ResolvedTransferResource = {
      resource,
      current: { ...resource, data: {} } as TransferResource,
      revision: new Date().toISOString(),
      scope: testCase.scope,
      dependencies: [],
      additionalChanges: [{ field: 'setting', before: false, after: true }],
    };
    jest.spyOn(adapter, 'resolve').mockResolvedValue(snapshot);
    jest.spyOn(adapter, 'assertMutable').mockResolvedValue(undefined);
    jest.spyOn(adapter, 'validate').mockResolvedValue(undefined);
    const apply = jest.spyOn(adapter, 'apply').mockResolvedValue({});
    const journal = { findCommittedRequest: jest.fn().mockResolvedValue(null), begin: jest.fn() };
    const service = new DataTransferService(
      prisma as never,
      authorization,
      unused,
      [adapter],
      new TransferKeyAllocations(),
      journal as never,
    );
    const document = { format: 'cacic-event-data', version: 1, resources: [resource] };
    return { authorization, adapter, snapshot, service, document, setImportTarget, apply, journal };
  }

  beforeEach(() => activeScopes.mockReset());

  it('blocks preview and writes when only another target has the import grant', async () => {
    const test = harness('target-a');
    // A collection grant opens the endpoint, but cannot authorize this resource.
    await expect(
      test.authorization.assertPermissions(actor, [Permission.DataTransfer.Import], { allowScopedCollection: true }),
    ).resolves.toBeUndefined();
    await expect(test.adapter.assertWrite(test.snapshot, 'update', { actor } as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const preview = await test.service.preview({ document: test.document }, actor);
    expect(preview.items[0].status).toBe('blocked');
    expect(preview.canApply).toBe(false);
    expect(preview.items[0].changes).toEqual([]);
  });

  it('allows a matching scope and rechecks that scope before applying', async () => {
    const test = harness('target-b');
    const preview = await test.service.preview({ document: test.document }, actor);
    expect(preview.items[0].status).toBe('ready');
    test.setImportTarget('target-a');
    await expect(
      test.service.apply(
        {
          document: test.document,
          planHash: preview.planHash,
          allowPartial: true,
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(test.apply).not.toHaveBeenCalled();
    expect(test.journal.begin).not.toHaveBeenCalled();
  });
});

describe.each(['EVENT', 'MAJOR_EVENT'] as const)('shared form import with a %s owner', (ownerType) => {
  const actor = { sub: 'organizer-1', roleSet: new Set([EventManagerKeycloakRole.Access]) } as AuthenticatedUser;
  const ownerScope = ownerType === 'EVENT' ? { eventId: 'owner-a' } : { majorEventId: 'owner-a' };
  const writePermissions = [Permission.DataTransfer.Import, Permission.EventForm.Update];

  function harness() {
    const stored = {
      id: 'shared-form',
      updatedAt: new Date(),
      deletedAt: null,
      ownerEventId: ownerType === 'EVENT' ? 'owner-a' : null,
      ownerMajorEventId: ownerType === 'MAJOR_EVENT' ? 'owner-a' : null,
      name: 'Shared form',
      description: null,
      elements: [],
      sigilo: 'SECRET',
      responseMode: 'ONE_PER_TARGET',
      resultsPublic: false,
      resultsLive: false,
      allowResponseEdits: false,
      descriptionImages: [],
      links: [{ eventId: 'linked-b', majorEventId: null }],
    };
    const prisma = {
      event: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          eventGroupId: null,
          majorEventId: null,
        })),
        findUnique: jest.fn().mockResolvedValue({ eventGroupId: null, majorEventId: null }),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'owner-a' }) },
      eventForm: {
        findFirst: jest.fn().mockResolvedValue(stored),
        updateMany: jest.fn(),
      },
    };
    const authorization = new AuthorizationPolicyService(prisma as never);
    const scopedGrant = (
      permission: Permission,
      scope: EventManagerPermissionScope,
      targetId: string,
    ): EffectiveRoleScope => ({
      permission,
      scope,
      eventId: scope === EventManagerPermissionScope.EVENT ? targetId : null,
      eventGroupId: null,
      majorEventId: scope === EventManagerPermissionScope.MAJOR_EVENT ? targetId : null,
    });
    const linkedGrants = [Permission.DataTransfer.Import, Permission.EventForm.Read, Permission.EventForm.Update].map(
      (permission) => scopedGrant(permission, EventManagerPermissionScope.EVENT, 'linked-b'),
    );
    const setOwnerPermissions = (permissions: Permission[], global = false) => {
      const grants = [
        ...linkedGrants,
        ...permissions.map((permission) =>
          scopedGrant(permission, global ? EventManagerPermissionScope.GLOBAL : ownerType, 'owner-a'),
        ),
      ];
      activeScopes.mockImplementation(async (_prisma, _actorId, requested) =>
        grants.filter((grant) => !requested || requested.includes(grant.permission)),
      );
    };
    setOwnerPermissions([]);
    const unused = {} as never;
    const adapter = new ConfigurationTransferAdapter(
      prisma as never,
      authorization,
      {
        assertEventMutable: jest.fn().mockResolvedValue(undefined),
        assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
      } as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    const resource = {
      kind: 'event-form',
      id: stored.id,
      data: { sigilo: 'PUBLIC', resultsPublic: true, resultsLive: true },
    } as TransferResource;
    const document = { format: 'cacic-event-data', version: 1, resources: [resource] };
    const context = { actor, tx: prisma, document } as unknown as TransferAdapterContext;
    const apply = jest.spyOn(adapter, 'apply');
    const journal = { findCommittedRequest: jest.fn().mockResolvedValue(null), begin: jest.fn() };
    const service = new DataTransferService(
      {
        ...prisma,
        $transaction: jest.fn(async (operation: (tx: unknown) => Promise<unknown>) => operation(prisma)),
      } as never,
      authorization,
      unused,
      [adapter],
      new TransferKeyAllocations(),
      journal as never,
    );
    return {
      authorization,
      adapter,
      resource,
      context,
      document,
      service,
      setOwnerPermissions,
      apply,
      journal,
      prisma,
    };
  }

  beforeEach(() => activeScopes.mockReset());

  it.each([
    { permissions: [] },
    { permissions: [Permission.DataTransfer.Import] },
    { permissions: [Permission.EventForm.Update] },
  ])('blocks linked-target grants with only these owner permissions: $permissions', async ({ permissions }) => {
    const test = harness();
    test.setOwnerPermissions(permissions);
    const snapshot = await test.adapter.resolve(test.resource, test.context);
    // Reading a linked form is legitimate; editing its shared configuration requires the owner.
    await expect(test.adapter.assertRead(snapshot, test.context)).resolves.toBeUndefined();
    await expect(test.adapter.assertWrite(snapshot, 'update', test.context)).rejects.toBeInstanceOf(ForbiddenException);
    const preview = await test.service.preview({ document: test.document }, actor);
    expect(preview.items[0]).toMatchObject({ status: 'blocked', changes: [] });
    expect(preview.canApply).toBe(false);
    await expect(
      test.service.apply({ document: test.document, planHash: preview.planHash, allowPartial: true }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(test.apply).not.toHaveBeenCalled();
    expect(test.journal.begin).not.toHaveBeenCalled();
    expect(test.prisma.eventForm.updateMany).not.toHaveBeenCalled();
  });

  it.each([false, true])('allows owner permissions (global: %s)', async (global) => {
    const test = harness();
    test.setOwnerPermissions(writePermissions, global);
    const snapshot = await test.adapter.resolve(test.resource, test.context);
    await expect(test.adapter.assertWrite(snapshot, 'update', test.context)).resolves.toBeUndefined();
    const preview = await test.service.preview({ document: test.document }, actor);
    expect(preview.items[0]).toMatchObject({ status: 'ready', action: 'update' });
    expect(preview.canApply).toBe(true);
  });

  it.each(writePermissions)('rechecks owner %s permission at apply after a valid preview', async (permission) => {
    const test = harness();
    test.setOwnerPermissions(writePermissions);
    const preview = await test.service.preview({ document: test.document }, actor);
    expect(preview.canApply).toBe(true);
    test.setOwnerPermissions(writePermissions.filter((candidate) => candidate !== permission));
    // The linked-target grant still passes the collection gate and shared-form checks.
    await expect(
      test.authorization.assertPermissions(actor, [permission], { ...ownerScope, eventFormId: 'shared-form' }),
    ).resolves.toBeUndefined();
    await expect(
      test.service.apply({ document: test.document, planHash: preview.planHash, allowPartial: true }, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(test.apply).not.toHaveBeenCalled();
    expect(test.journal.begin).not.toHaveBeenCalled();
    expect(test.prisma.eventForm.updateMany).not.toHaveBeenCalled();
  });
});
