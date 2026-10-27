import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { EventPreparationResolver } from './event-preparation.resolver';

function setup() {
  const previous = {
    id: 'event',
    name: 'Evento',
    lecturerInformation: 'Contato anterior',
    collectorInformation: null,
    preparationUpdatedAt: null,
    materials: [],
    materialsUpdatedAt: null,
  };
  const tx = {
    $executeRaw: jest.fn(),
    event: { findFirst: jest.fn().mockResolvedValue(previous), update: jest.fn().mockResolvedValue(previous) },
  };
  const prisma = {
    event: { findFirst: jest.fn().mockResolvedValue(previous) },
    eventLecturer: { findUnique: jest.fn().mockResolvedValue({ personId: 'speaker' }) },
    $transaction: jest.fn(async (callback) => callback(tx)),
  };
  const authorization = { assertPermissions: jest.fn(), assertAttendanceCollectorForEvent: jest.fn() };
  const frozen = { assertEventUpdateMutable: jest.fn() };
  const audit = { record: jest.fn() };
  const currentUser = {
    getAuthenticatedUser: () => ({ sub: 'actor' }),
    requireCurrentPerson: async () => ({ id: 'speaker' }),
  };
  const resolver = new EventPreparationResolver(
    prisma as never,
    currentUser as never,
    authorization as never,
    frozen as never,
    audit as never,
  );
  return { resolver, prisma, tx, authorization, frozen, audit, previous };
}

describe('event preparation access and writes', () => {
  it('requires scoped read/update permission for internal team instructions', async () => {
    const { resolver, authorization, prisma } = setup();
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    await expect(resolver.eventPreparation('event', {})).rejects.toThrow(ForbiddenException);
    await expect(resolver.updateEventPreparation('event', 'secret', null, null, {})).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('writes trimmed instructions and audits before/after in the same transaction', async () => {
    const { resolver, tx, audit } = setup();
    const result = await resolver.updateEventPreparation('event', ' **Laboratório 3** ', ' Conferir sala ', null, {});
    expect(result).toEqual({
      lecturerInformation: '**Laboratório 3**',
      collectorInformation: 'Conferir sala',
      updatedAt: expect.any(Date),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        actor: { sub: 'actor' },
        scope: { permission: Permission.Event.Update, eventId: 'event' },
        before: { lecturerInformation: 'Contato anterior', collectorInformation: null },
        after: { lecturerInformation: '**Laboratório 3**', collectorInformation: 'Conferir sala' },
        squashWindowMs: 0,
      }),
      tx,
    );
  });

  it('rejects stale revisions before updating anything', async () => {
    const { resolver, tx } = setup();
    tx.event.findFirst.mockResolvedValueOnce({ preparationUpdatedAt: new Date() });
    await expect(resolver.updateEventPreparation('event', 'new', null, null, {})).rejects.toThrow(ConflictException);
    expect(tx.event.update).not.toHaveBeenCalled();
  });

  it('enforces event freezing for both admin and speaker writes', async () => {
    const { resolver, frozen, prisma } = setup();
    frozen.assertEventUpdateMutable.mockRejectedValue(new ForbiddenException('frozen'));
    await expect(resolver.updateEventPreparation('event', null, null, null, {})).rejects.toThrow('frozen');
    await expect(resolver.updateEventMaterials('event', [], null, {})).rejects.toThrow('frozen');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows a linked lecturer to share validated links without any notification input', async () => {
    const { resolver, authorization, prisma, audit, tx } = setup();
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    const links = [{ title: ' Slides ', url: 'https://example.org/slides' }];
    const result = await resolver.updateEventMaterials('event', links, null, {});
    expect(prisma.eventLecturer.findUnique).toHaveBeenCalledWith({
      where: { eventId_personId: { eventId: 'event', personId: 'speaker' } },
    });
    expect(result.links).toEqual([{ title: 'Slides', url: 'https://example.org/slides' }]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        before: { materials: [] },
        after: { materials: result.links },
        scope: { eventId: 'event' },
      }),
      tx,
    );
    expect(JSON.stringify(tx.event.update.mock.calls)).not.toContain('subscriberInformation');
  });

  it('prevents lecturers from editing a different event and does not mask unexpected authorization failures', async () => {
    const { resolver, authorization, prisma } = setup();
    authorization.assertPermissions.mockRejectedValueOnce(new ForbiddenException());
    prisma.eventLecturer.findUnique.mockResolvedValueOnce(null);
    await expect(resolver.updateEventMaterials('other', [], null, {})).rejects.toThrow(ForbiddenException);
    authorization.assertPermissions.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(resolver.editableEventMaterials('event', {})).rejects.toThrow('database unavailable');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects unsafe links and oversized instructions without a write', async () => {
    const { resolver, prisma } = setup();
    await expect(
      resolver.updateEventMaterials('event', [{ title: 'Unsafe', url: 'javascript:alert(1)' }], null, {}),
    ).rejects.toThrow(BadRequestException);
    await expect(resolver.updateEventPreparation('event', 'x'.repeat(10001), null, null, {})).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('filters subscriber materials by publication and actual event subscription on the server', async () => {
    const { resolver, prisma } = setup();
    prisma.event.findFirst.mockResolvedValueOnce(null);
    await expect(resolver.currentUserEventMaterials('event', {})).resolves.toBeNull();
    expect(prisma.event.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'event',
          AND: expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) })]),
        }),
        select: { materials: true, materialsUpdatedAt: true, endDate: true },
      }),
    );
  });

  it('withholds scheduled URLs until the saved event end, including when the event is rescheduled', async () => {
    const { resolver, prisma, previous } = setup();
    const immediate = { title: 'Referências', url: 'https://example.org/referencias' };
    const scheduled = { title: 'Respostas', url: 'https://example.org/respostas', releaseAfterEvent: true };
    const futureEnd = new Date(Date.now() + 3600000);
    prisma.event.findFirst.mockResolvedValue({ ...previous, materials: [immediate, scheduled], endDate: futureEnd });
    const beforeEnd = await resolver.currentUserEventMaterials('event', {});
    expect(beforeEnd).toEqual({ links: [immediate], updatedAt: null, nextReleaseAt: futureEnd });
    expect(JSON.stringify(beforeEnd)).not.toContain(scheduled.url);
    const postponedEnd = new Date(futureEnd.getTime() + 3600000);
    prisma.event.findFirst.mockResolvedValue({ ...previous, materials: [immediate, scheduled], endDate: postponedEnd });
    expect((await resolver.currentUserEventMaterials('event', {}))?.nextReleaseAt).toEqual(postponedEnd);
    prisma.event.findFirst.mockResolvedValue({
      ...previous,
      materials: [immediate, scheduled],
      endDate: new Date(Date.now() - 1000),
    });
    expect(await resolver.currentUserEventMaterials('event', {})).toEqual({
      links: [immediate, scheduled],
      updatedAt: null,
      nextReleaseAt: null,
    });
  });

  it('requires a collector role when attendance administration is not permitted', async () => {
    const { resolver, authorization, prisma } = setup();
    authorization.assertPermissions.mockRejectedValue(new ForbiddenException());
    authorization.assertAttendanceCollectorForEvent.mockRejectedValue(new ForbiddenException());
    await expect(resolver.eventCollectorInformation('event', {})).rejects.toThrow(ForbiddenException);
    expect(prisma.event.findFirst).not.toHaveBeenCalled();
  });
});
