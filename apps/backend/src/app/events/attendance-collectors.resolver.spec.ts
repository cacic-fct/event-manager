import { Permission } from '@cacic-fct/shared-permissions';
import { AuditLogOperation } from '@prisma/client';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { EventAttendanceCollectorsResolver } from './attendance-collectors.resolver';

describe('EventAttendanceCollectorsResolver', () => {
  const actor = { sub: 'admin-1' };
  const eventAttendanceCollector = {
    findMany: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const prisma = {
    eventAttendanceCollector,
    $transaction: jest.fn(
      async (operation: (tx: { eventAttendanceCollector: typeof eventAttendanceCollector }) => Promise<unknown>) =>
        operation({ eventAttendanceCollector }),
    ),
  };
  const frozenResources = { assertEventMutable: jest.fn() };
  const auditLog = { record: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    frozenResources.assertEventMutable.mockResolvedValue(undefined);
    auditLog.record.mockResolvedValue(undefined);
  });

  it('declares exact read, create, and delete permissions', () => {
    expect(permissionFor('eventAttendanceCollectors')).toEqual([Permission.EventAttendanceCollector.Read]);
    expect(permissionFor('createEventAttendanceCollector')).toEqual([Permission.EventAttendanceCollector.Create]);
    expect(permissionFor('deleteEventAttendanceCollector')).toEqual([Permission.EventAttendanceCollector.Delete]);
  });

  it('lists collectors with optional filters and bounded pagination', async () => {
    const records = [{ eventId: 'event-1', personId: 'person-1' }];
    eventAttendanceCollector.findMany.mockResolvedValueOnce(records);

    await expect(resolver().eventAttendanceCollectors('event-1', 'person-1', 10, 25)).resolves.toBe(records);
    expect(eventAttendanceCollector.findMany).toHaveBeenCalledWith({
      where: { eventId: 'event-1', personId: 'person-1' },
      select: expect.objectContaining({ eventId: true, personId: true, person: true }),
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 25,
    });
  });

  it('creates a collector only after freeze validation and audits the request actor', async () => {
    const collector = { eventId: 'event-1', personId: 'person-1' };
    eventAttendanceCollector.create.mockResolvedValueOnce(collector);

    await expect(
      resolver().createEventAttendanceCollector(collector, { request: { user: actor } } as never),
    ).resolves.toBe(collector);

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'edit');
    expect(eventAttendanceCollector.create).toHaveBeenCalledWith({
      data: { eventId: 'event-1', personId: 'person-1', createdById: 'admin-1' },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.CREATE, actor, after: collector }),
      expect.anything(),
    );
  });

  it('deletes a collector only after delete-mode freeze validation and audits the prior record', async () => {
    const collector = { eventId: 'event-1', personId: 'person-1' };
    eventAttendanceCollector.delete.mockResolvedValueOnce(collector);

    await expect(
      resolver().deleteEventAttendanceCollector('event-1', 'person-1', { req: { user: actor } } as never),
    ).resolves.toEqual({ deleted: true, eventId: 'event-1', personId: 'person-1' });

    expect(frozenResources.assertEventMutable).toHaveBeenCalledWith('event-1', actor, 'delete');
    expect(eventAttendanceCollector.delete).toHaveBeenCalledWith({
      where: { eventId_personId: { eventId: 'event-1', personId: 'person-1' } },
    });
    expect(auditLog.record).toHaveBeenCalledWith(
      expect.objectContaining({ operation: AuditLogOperation.DELETE, actor, before: collector }),
      expect.anything(),
    );
  });

  it('does not write when frozen-resource validation fails', async () => {
    frozenResources.assertEventMutable.mockRejectedValueOnce(new Error('Evento congelado.'));

    await expect(
      resolver().createEventAttendanceCollector(
        { eventId: 'event-1', personId: 'person-1' },
        { req: { user: actor } } as never,
      ),
    ).rejects.toThrow('Evento congelado.');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  function resolver(): EventAttendanceCollectorsResolver {
    return new EventAttendanceCollectorsResolver(prisma as never, frozenResources as never, auditLog as never);
  }
});

function permissionFor(operation: keyof EventAttendanceCollectorsResolver): unknown {
  return Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, EventAttendanceCollectorsResolver.prototype[operation]);
}
