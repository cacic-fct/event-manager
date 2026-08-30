import { Logger } from '@nestjs/common';
import { EventFormTargetType, PublicationState } from '@prisma/client';
import { EventFormPublicationWorkflowService } from './event-form-publication-workflow.service';
import {
  notifyDueAvailableEventFormLinks,
  publishDueScheduledEventForms,
  publishEventFormNow,
} from './event-form-publication';
import { normalizeFormName, replaceEventFormLinks } from './event-form-service-support';
import { formRecord } from './event-form.spec-support';

function createRealtimeMock(scope = (channel: string) => channel) {
  return {
    scope: jest.fn(scope),
    publish: jest.fn().mockResolvedValue({}),
  };
}

describe('event form publication and service support helpers', () => {
  it('publishes scheduled-form mutations to both administrative and public catalog streams', async () => {
    const scheduledPublishAt = new Date(Date.now() + 60_000);
    const form = formRecord({ publicationState: PublicationState.UNPUBLISHED });
    const scheduled = formRecord({ publicationState: PublicationState.SCHEDULED, scheduledPublishAt });
    const tx = {
      eventForm: {
        update: jest.fn().mockResolvedValue(scheduled),
      },
    };
    const prisma = {
      eventForm: {
        findFirst: jest.fn().mockResolvedValue(form),
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const authorizationPolicy = { assertPermissions: jest.fn() };
    const currentUser = {};
    const notifications = {};
    const auditLog = { record: jest.fn() };
    const realtime = createRealtimeMock((channel) => `scope:${channel}`);
    const service = new EventFormPublicationWorkflowService(
      prisma as never,
      authorizationPolicy as never,
      currentUser as never,
      notifications as never,
      auditLog as never,
      realtime as never,
    );

    await expect(service.publishForm('form-1', scheduledPublishAt, { sub: 'admin-1' } as never)).resolves.toEqual(
      expect.objectContaining({ id: 'form-1', publicationState: PublicationState.SCHEDULED }),
    );

    expect(realtime.publish).toHaveBeenCalledTimes(2);
    expect(realtime.publish).toHaveBeenCalledWith(
      'scope:admin-workspace',
      expect.objectContaining({ type: 'EVENT_FORMS_INVALIDATED', formId: 'form-1' }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'scope:public-catalog-v2',
      expect.objectContaining({ type: 'PUBLIC_CATALOG_INVALIDATED', revision: expect.any(String) }),
    );
  });

  it('keeps a committed scheduled-form mutation successful when realtime publication fails', async () => {
    const scheduledPublishAt = new Date(Date.now() + 60_000);
    const form = formRecord({ publicationState: PublicationState.UNPUBLISHED });
    const scheduled = formRecord({ publicationState: PublicationState.SCHEDULED, scheduledPublishAt });
    const tx = { eventForm: { update: jest.fn().mockResolvedValue(scheduled) } };
    const prisma = {
      eventForm: { findFirst: jest.fn().mockResolvedValue(form) },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const realtime = createRealtimeMock();
    realtime.publish.mockRejectedValue(new Error('Realtime unavailable'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new EventFormPublicationWorkflowService(
      prisma as never,
      { assertPermissions: jest.fn() } as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
      realtime as never,
    );

    try {
      await expect(service.publishForm('form-1', scheduledPublishAt, { sub: 'admin-1' } as never)).resolves.toEqual(
        expect.objectContaining({ id: 'form-1', publicationState: PublicationState.SCHEDULED }),
      );
      expect(realtime.publish).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Event-form realtime invalidation failed after mutation form-1 committed'),
        expect.any(String),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('publishes an invalidation after unpublishing a form', async () => {
    const form = formRecord({ publicationState: PublicationState.PUBLISHED });
    const unpublished = formRecord({ publicationState: PublicationState.UNPUBLISHED, unpublishedAt: new Date() });
    const tx = {
      eventForm: {
        update: jest.fn().mockResolvedValue(unpublished),
      },
    };
    const prisma = {
      eventForm: {
        findFirst: jest.fn().mockResolvedValue(form),
      },
      $transaction: jest.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
    };
    const realtime = createRealtimeMock();
    const service = new EventFormPublicationWorkflowService(
      prisma as never,
      { assertPermissions: jest.fn() } as never,
      {} as never,
      {} as never,
      { record: jest.fn() } as never,
      realtime as never,
    );

    await expect(service.unpublishForm('form-1', { sub: 'admin-1' } as never)).resolves.toEqual(
      expect.objectContaining({ id: 'form-1', publicationState: PublicationState.UNPUBLISHED }),
    );

    expect(realtime.publish).toHaveBeenCalledTimes(2);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({ type: 'EVENT_FORMS_INVALIDATED', formId: 'form-1' }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'public-catalog-v2',
      expect.objectContaining({ type: 'PUBLIC_CATALOG_INVALIDATED' }),
    );
  });

  it('publishes one invalidation for a successful scheduled-publication sweep', async () => {
    const published = formRecord({ publicationState: PublicationState.PUBLISHED });
    const eventForm = {
      findMany: jest.fn().mockResolvedValue([{ id: 'form-1' }]),
      findFirst: jest.fn().mockResolvedValue(formRecord({ publicationState: PublicationState.SCHEDULED })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue(published),
    };
    const transactionState = { eventForm };
    const prisma = {
      eventForm,
      $transaction: jest.fn(async (callback: (transaction: typeof transactionState) => unknown) => callback(transactionState)),
    };
    const realtime = createRealtimeMock();
    const service = new EventFormPublicationWorkflowService(
      prisma as never,
      { assertPermissions: jest.fn() } as never,
      {} as never,
      { notifyEligiblePeople: jest.fn().mockResolvedValue(0) } as never,
      { record: jest.fn() } as never,
      realtime as never,
    );

    await expect(service.publishDueScheduledForms()).resolves.toBe(1);

    expect(realtime.publish).toHaveBeenCalledTimes(2);
    expect(realtime.publish).toHaveBeenCalledWith(
      'admin-workspace',
      expect.objectContaining({ type: 'EVENT_FORMS_INVALIDATED', formId: null }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      'public-catalog-v2',
      expect.objectContaining({ type: 'PUBLIC_CATALOG_INVALIDATED' }),
    );
  });

  it('publishes due forms and notifies available links through extracted helpers', async () => {
    const eventForm = {
      findMany: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'form-1' }, { id: 'form-2' }])
        .mockResolvedValueOnce([formRecord({ id: 'form-3' })]),
      findFirst: jest.fn((args: { where: { id: string } }) => Promise.resolve(formRecord({ id: args.where.id }))),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn((args: { where: { id: string } }) =>
        Promise.resolve(
          formRecord({
            id: args.where.id,
            publicationState: PublicationState.PUBLISHED,
            scheduledPublishAt: null,
            publishedAt: new Date(),
            unpublishedAt: null,
            publicationUpdatedBy: null,
          }),
        ),
      ),
    };
    const transaction = { eventForm };
    const prisma = {
      eventForm,
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
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
    const eventForm = {
      findFirst: jest
        .fn()
        .mockResolvedValue(formRecord({ id: 'form-1', publicationState: PublicationState.SCHEDULED })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue(formRecord({ id: 'form-1', publicationState: PublicationState.PUBLISHED })),
    };
    const transaction = { eventForm };
    const prisma = {
      eventForm,
      $transaction: jest.fn(async (callback: (tx: typeof transaction) => unknown) => callback(transaction)),
    };
    const tx = {
      eventFormLink: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        create: jest.fn().mockResolvedValue({ id: 'link-1' }),
      },
      eventFormLinkPriceTier: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
    };

    await expect(
      publishEventFormNow(prisma as never, formNotifications as never, 'form-1', 'admin-user'),
    ).resolves.toEqual(expect.objectContaining({ id: 'form-1', publicationState: PublicationState.PUBLISHED }));
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
