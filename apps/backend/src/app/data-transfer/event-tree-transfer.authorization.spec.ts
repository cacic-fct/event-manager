import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createTransferTemplate } from '@cacic-fct/shared-data-transfer';
import { Permission } from '@cacic-fct/shared-permissions';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DataTransferService } from './data-transfer.service';
import { EventTreeTransferAdapter } from './event-tree-transfer.adapter';
import { TransferKeyAllocations } from './transfer-key-allocations';
const { jest } = import.meta;

describe('new event tree authorization', () => {
  it('previews a complete key-only tree with global grants without scoping to nonexistent parents', async () => {
    const existingRows = {
      event: new Set<string>(),
      eventGroup: new Set<string>(),
      majorEvent: new Set<string>(),
    };
    const tx = {
      event: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
          existingRows.event.has(where.id) ? { id: where.id } : null,
        ),
      },
      eventGroup: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
          existingRows.eventGroup.has(where.id) ? { id: where.id, majorEventId: null } : null,
        ),
      },
      majorEvent: {
        findFirst: jest.fn(async ({ where }: { where: { id: string } }) =>
          existingRows.majorEvent.has(where.id) ? { id: where.id } : null,
        ),
      },
    };
    const globalPermissions = new Set<Permission>([
      Permission.DataTransfer.Import,
      Permission.Event.Read,
      Permission.Event.Create,
      Permission.EventGroup.Read,
      Permission.EventGroup.Create,
      Permission.MajorEvent.Read,
      Permission.MajorEvent.Create,
    ]);
    const assertPermissions = jest.fn(
      async (_actor: AuthenticatedUser, permissions: readonly Permission[], context: Record<string, unknown> = {}) => {
        for (const [field, rows] of Object.entries(existingRows)) {
          const id = context[field === 'event' ? 'eventId' : field === 'eventGroup' ? 'eventGroupId' : 'majorEventId'];
          if (typeof id === 'string' && !rows.has(id)) throw new NotFoundException('Event resource was not found.');
        }
        if (Object.keys(context).every((key) => key === 'allowScopedCollection')) {
          for (const permission of permissions) {
            if (!globalPermissions.has(permission)) throw new Error(`Missing global grant for ${permission}`);
          }
        }
      },
    );
    const adapter = new EventTreeTransferAdapter(
      {} as never,
      { assertPermissions } as never,
      {
        assertEventMutable: jest.fn(),
        assertEventGroupMutable: jest.fn(),
        assertMajorEventMutable: jest.fn(),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const prisma = {
      $transaction: jest.fn(async (operation: (client: unknown) => Promise<unknown>) => operation(tx)),
    };
    const authorization = {
      assertPermissions,
      grantedPermissionSet: jest.fn().mockResolvedValue(globalPermissions),
    };
    const service = new DataTransferService(
      prisma as never,
      authorization as never,
      {} as never,
      [adapter],
      new TransferKeyAllocations(),
      {} as never,
    );
    const actor = { sub: 'global-organizer' } as AuthenticatedUser;
    const document = createTransferTemplate('major-event');
    const actorId = actor.sub;
    if (!actorId) throw new Error('Test actor needs a stable subject.');
    const resolvedDocument = new TransferKeyAllocations().preview(document, actorId).document;
    const eventResource = resolvedDocument.resources.find((resource) => resource.kind === 'event');
    if (!eventResource) throw new Error('Expected event in key-only template.');
    const context = { tx, actor, document: resolvedDocument, frozenResources: {} } as never;
    const eventSnapshot = await adapter.resolve(eventResource, context);
    await adapter.validate(eventSnapshot, context);

    const preview = await service.preview({ document }, actor);

    expect(preview.items.map(({ kind, status, message }) => ({ kind, status, message }))).toEqual([
      { kind: 'major-event', status: 'ready', message: 'Pronto para criar.' },
      { kind: 'group', status: 'ready', message: 'Pronto para criar.' },
      { kind: 'event', status: 'ready', message: 'Pronto para criar.' },
    ]);
    expect(preview.summary).toEqual({ create: 3, update: 0, unchanged: 0, skip: 0 });
    expect(preview.canApply).toBe(true);
    expect(preview.items.map((item) => item.status)).toEqual(['ready', 'ready', 'ready']);
    expect(assertPermissions).toHaveBeenCalledWith(actor, [Permission.DataTransfer.Import, Permission.Event.Read], {});
    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.EventGroup.Read],
      {},
    );
    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.MajorEvent.Read],
      {},
    );
    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.Event.Create],
      {},
    );
    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.EventGroup.Create],
      {},
    );
    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.MajorEvent.Create],
      {},
    );
  });

  it('does not include denied descendant IDs in export issues', async () => {
    const group = {
      id: 'group-root',
      updatedAt: new Date(),
      deletedAt: null,
      name: 'Root group',
      emoji: '',
      audience: 'PUBLIC',
      audienceCourseCodes: [],
      majorEventId: null,
      interestEnabled: false,
      requiresImageLicenseAgreement: false,
      attendanceEligibility: null,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      sportsCategory: null,
    };
    const tx = {
      eventGroup: { findFirst: jest.fn().mockResolvedValue(group) },
      event: { findMany: jest.fn().mockResolvedValue([{ id: 'private-event', sportsMatch: null }]) },
    };
    const actor = { sub: 'organizer-1' } as AuthenticatedUser;
    const authorization = {
      assertPermissions: jest.fn(
        async (_actor: AuthenticatedUser, permissions: readonly Permission[], scope: Record<string, unknown>) => {
          if (scope['eventGroupId'] === 'group-root' && permissions.includes(Permission.EventGroup.Read)) return;
          if (permissions.includes(Permission.Event.Read)) throw new ForbiddenException();
        },
      ),
    };
    const adapter = new EventTreeTransferAdapter(
      {} as never,
      authorization as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const exported = await adapter.exportTarget(
      { kind: 'group', id: 'group-root' },
      {
        includeDescendants: true,
        includeConfiguration: false,
        includeSubscriptions: false,
        includeAttendances: false,
      },
      { tx, actor, document: { format: 'cacic-event-data', version: 1, resources: [] }, frozenResources: {} } as never,
    );

    expect(exported.issues).toEqual([{ kind: 'event', message: 'Um evento foi omitido por falta de acesso.' }]);
    expect(JSON.stringify(exported.issues)).not.toContain('private-event');
  });

  it('authorizes a new event against its existing parents instead of its nonexistent ID', async () => {
    const resource = {
      kind: 'event',
      id: 'event-new',
      data: {
        name: 'Final',
        startDate: new Date(Date.now() + 86_400_000).toISOString(),
        endDate: new Date(Date.now() + 90_000_000).toISOString(),
        eventGroupId: 'group-existing',
        majorEventId: 'major-existing',
      },
    } as const;
    const tx = {
      event: { findFirst: jest.fn().mockResolvedValue(null) },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({ id: 'group-existing', majorEventId: 'major-existing' }),
      },
      majorEvent: { findFirst: jest.fn().mockResolvedValue({ id: 'major-existing' }) },
    };
    const assertPermissions = jest.fn().mockResolvedValue(undefined);
    const adapter = new EventTreeTransferAdapter(
      {} as never,
      { assertPermissions } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const actor = { sub: 'organizer-1' } as AuthenticatedUser;
    const context = {
      tx,
      actor,
      document: { format: 'cacic-event-data', version: 1, resources: [resource] },
      frozenResources: {},
    } as never;
    const snapshot = await adapter.resolve(resource, context);

    await adapter.assertRead(snapshot, context);
    await adapter.assertWrite(snapshot, 'create', context);

    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.EventGroup.Read],
      { eventGroupId: 'group-existing' },
    );
    expect(assertPermissions).toHaveBeenCalledWith(
      actor,
      [Permission.DataTransfer.Import, Permission.MajorEvent.Read],
      { majorEventId: 'major-existing' },
    );
    expect(assertPermissions).toHaveBeenCalledWith(actor, [Permission.DataTransfer.Import, Permission.Event.Create], {
      eventGroupId: 'group-existing',
    });
    expect(assertPermissions).toHaveBeenCalledWith(actor, [Permission.DataTransfer.Import, Permission.Event.Create], {
      majorEventId: 'major-existing',
    });
    expect(assertPermissions.mock.calls.flatMap(([, , scope]) => Object.values(scope))).not.toContain('event-new');
  });
});
