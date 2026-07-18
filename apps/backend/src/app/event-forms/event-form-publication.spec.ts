import { EventFormTargetType, PublicationState } from '@prisma/client';
import {
  notifyDueAvailableEventFormLinks,
  publishDueScheduledEventForms,
  publishEventFormNow,
} from './event-form-publication';
import {
  normalizeFormName,
  replaceEventFormLinks,
} from './event-form-service-support';
import { formRecord } from './event-form.spec-support';

describe('event form publication and service support helpers', () => {
  it('publishes due forms and notifies available links through extracted helpers', async () => {
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      eventForm: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ id: 'form-1' }, { id: 'form-2' }])
          .mockResolvedValueOnce([formRecord({ id: 'form-3' })]),
        findFirst: jest.fn((args: { where: { id: string } }) => Promise.resolve(formRecord({ id: args.where.id }))),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn((args: { where: { id: string } }) => Promise.resolve(formRecord({
          id: args.where.id,
          publicationState: PublicationState.PUBLISHED,
          scheduledPublishAt: null,
          publishedAt: new Date('2026-07-01T12:00:00.000Z'),
          unpublishedAt: null,
          publicationUpdatedBy: null,
        }))),
      },
    };
    const notifications = {
      notifyEligiblePeople: jest.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(3),
    };

    await expect(publishDueScheduledEventForms(prisma as never, notifications as never)).resolves.toBe(2);
    expect(prisma.eventForm.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'form-1',
          publicationState: PublicationState.SCHEDULED,
          deletedAt: null,
        }),
        data: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
          scheduledPublishAt: null,
          unpublishedAt: null,
        }),
      }),
    );
    expect(prisma.eventForm.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'form-1' },
      include: expect.any(Object),
    });

    await expect(notifyDueAvailableEventFormLinks(prisma as never, notifications as never)).resolves.toBe(3);
    expect(prisma.eventForm.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          publicationState: PublicationState.PUBLISHED,
          links: {
            some: expect.objectContaining({
              notifyOnPublish: true,
              lastNotifiedAt: null,
            }),
          },
        }),
        include: expect.any(Object),
      }),
    );
  });

  it('publishes one form and replaces links with subscription-flow constraints', async () => {
    const formNotifications = { notifyEligiblePeople: jest.fn().mockResolvedValue(1) };
    const prisma = {
      $transaction: jest.fn(async (callback: (tx: unknown) => unknown) => callback(prisma)),
      eventForm: {
        findFirst: jest.fn().mockResolvedValue(formRecord({ id: 'form-1', publicationState: PublicationState.SCHEDULED })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(formRecord({ id: 'form-1', publicationState: PublicationState.PUBLISHED })),
      },
    };
    const tx = {
      eventFormLink: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn(),
      },
    };

    await expect(publishEventFormNow(prisma as never, formNotifications as never, 'form-1', 'admin-user')).resolves
      .toEqual(expect.objectContaining({ id: 'form-1', publicationState: PublicationState.PUBLISHED }));
    expect(formNotifications.notifyEligiblePeople).toHaveBeenCalledWith(expect.objectContaining({ id: 'form-1' }));

    await replaceEventFormLinks(
      tx as never,
      'form-1',
      [
        {
          targetType: EventFormTargetType.EVENT,
          eventId: 'event-1',
          insertInSubscriptionFlow: true,
          requiredInSubscriptionFlow: true,
          notifyOnPublish: true,
          allowLecturerManualPublish: true,
        },
      ],
      'admin-user',
    );

    expect(tx.eventFormLink.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { formId: 'form-1', deletedAt: null },
        data: expect.objectContaining({ updatedById: 'admin-user' }),
      }),
    );
    expect(tx.eventFormLink.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        formId: 'form-1',
        eventId: 'event-1',
        insertInSubscriptionFlow: true,
        requiredInSubscriptionFlow: true,
        notifyOnPublish: true,
        allowLecturerManualPublish: false,
        createdById: 'admin-user',
      }),
    });
    expect(normalizeFormName('   ', 'Novo formulário')).toBe('Novo formulário');
  });
});
