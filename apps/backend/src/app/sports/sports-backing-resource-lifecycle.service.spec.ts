import { ConflictException } from '@nestjs/common';
import { SportsBackingResourceLifecycleService } from './sports-backing-resource-lifecycle.service';

describe('SportsBackingResourceLifecycleService', () => {
  const service = new SportsBackingResourceLifecycleService();

  it('prevents generic events from being created inside a sports category group', async () => {
    const tx = {
      sportsCategory: {
        findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }),
      },
    };

    await expect(service.assertEventCreateAllowed(tx as never, 'group-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows shared match event edits but protects sports ownership fields', async () => {
    const tx = {
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue({
          event: {
            id: 'event-1',
            majorEventId: 'major-1',
            eventGroupId: 'group-1',
            creditMinutes: 60,
            emoji: '⚽',
            type: 'OTHER',
            latitude: -22.12,
            longitude: -51.4,
            locationDescription: 'Ginásio · Quadra 1',
            allowSubscription: false,
            requiresImageLicenseAgreement: false,
            subscriptionStartDate: null,
            subscriptionEndDate: null,
            slots: null,
            autoSubscribe: false,
            shouldIssueCertificate: false,
            shouldIssueCertificateForNonPayingAttendees: false,
            shouldIssueCertificateForNonSubscribedAttendees: false,
            shouldCollectAttendance: true,
            isOnlineAttendanceAllowed: false,
            shouldProvideSubscriberListToLecturer: false,
            onlineAttendanceCode: null,
            onlineAttendanceStartDate: null,
            onlineAttendanceEndDate: null,
            youtubeCode: 'video-1',
          },
        }),
      },
    };

    await expect(
      service.assertEventUpdateAllowed(tx as never, 'event-1', {
        name: 'Final atualizada',
        startDate: new Date('2026-08-12T14:00:00.000Z'),
        description: 'Descrição atualizada',
        publiclyVisible: true,
        eventGroupId: 'group-1',
        creditMinutes: 60,
        emoji: '⚽',
        type: 'OTHER',
        latitude: -22.12,
        longitude: -51.4,
        locationDescription: 'Ginásio · Quadra 1',
        allowSubscription: false,
        requiresImageLicenseAgreement: false,
        autoSubscribe: false,
        shouldIssueCertificate: false,
        shouldIssueCertificateForNonPayingAttendees: false,
        shouldIssueCertificateForNonSubscribedAttendees: false,
        shouldCollectAttendance: true,
        isOnlineAttendanceAllowed: false,
        shouldProvideSubscriberListToLecturer: false,
        youtubeCode: 'video-1',
      }),
    ).resolves.toBeUndefined();
    await expect(
      service.assertEventUpdateAllowed(tx as never, 'event-1', { eventGroupId: 'group-2' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.assertEventUpdateAllowed(tx as never, 'event-1', { allowSubscription: true }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.assertEventUpdateAllowed(tx as never, 'event-1', { locationDescription: 'Outra quadra' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.assertEventUpdateAllowed(tx as never, 'event-1', { youtubeCode: 'outro-video' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.assertEventUpdateAllowed(tx as never, 'event-1', { shouldIssueCertificate: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('synchronizes a generic event-group rename into its sports category', async () => {
    const tx = {
      sportsCategory: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'category-1',
            name: 'Futsal',
            division: null,
            revision: 4,
            tournamentId: 'tournament-1',
          })
          .mockResolvedValueOnce(null),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await service.synchronizeEventGroupUpdate(tx as never, 'group-1', { name: 'Futsal feminino' }, 'admin-1');

    expect(tx.sportsCategory.updateMany).toHaveBeenCalledWith({
      where: { id: 'category-1', revision: 4, deletedAt: null },
      data: {
        name: 'Futsal feminino',
        revision: { increment: 1 },
        updatedById: 'admin-1',
      },
    });
  });

  it('prevents generic deletion of active sports-backed resources', async () => {
    const tx = {
      sportsMatch: { findFirst: jest.fn().mockResolvedValue({ id: 'match-1' }) },
      sportsCategory: { findFirst: jest.fn().mockResolvedValue({ id: 'category-1' }) },
      sportsTournament: { findFirst: jest.fn().mockResolvedValue({ id: 'tournament-1' }) },
    };

    await expect(service.assertEventDeleteAllowed(tx as never, 'event-1')).rejects.toBeInstanceOf(ConflictException);
    await expect(service.assertEventGroupDeleteAllowed(tx as never, 'group-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(service.assertMajorEventDeleteAllowed(tx as never, 'major-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
