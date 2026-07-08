import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CertificateScope } from '@prisma/client';
import {
  FROZEN_DELETE_PERMISSION,
  FROZEN_EDIT_PERMISSION,
  FrozenResourceService,
  getLatestDate,
  isFrozenFromDates,
} from './frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('FrozenResourceService', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('freezes when the latest date is older than two months', () => {
    expect(
      isFrozenFromDates(
        [new Date('2026-01-01T12:00:00.000Z'), new Date('2026-03-01T12:00:00.000Z')],
        now,
      ),
    ).toBe(true);
  });

  it('freezes from createdAt when endDate is empty', () => {
    expect(isFrozenFromDates([new Date('2026-01-01T12:00:00.000Z'), null], now)).toBe(true);
  });

  it('does not freeze when createdAt or endDate is recent', () => {
    expect(
      isFrozenFromDates(
        [new Date('2026-05-01T12:00:00.000Z'), new Date('2026-01-01T12:00:00.000Z')],
        now,
      ),
    ).toBe(false);
    expect(
      isFrozenFromDates(
        [new Date('2026-01-01T12:00:00.000Z'), new Date('2026-05-01T12:00:00.000Z')],
        now,
      ),
    ).toBe(false);
  });

  it('ignores null and invalid dates when resolving the latest date', () => {
    expect(getLatestDate([null, undefined, new Date('invalid')])).toBeNull();
    expect(
      getLatestDate([new Date('2026-01-01T12:00:00.000Z'), new Date('2026-05-01T12:00:00.000Z')]),
    ).toEqual(new Date('2026-05-01T12:00:00.000Z'));
  });

  it('denies editing an old event without frozen permission', async () => {
    const service = new FrozenResourceService({
      event: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
          endDate: new Date('2026-02-01T12:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService);

    await expect(service.assertEventMutable('event-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows editing an old event with frozen update permission', async () => {
    const service = new FrozenResourceService({
      event: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
          endDate: new Date('2026-02-01T12:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService);

    await expect(service.assertEventMutable('event-1', buildUser(['frozen#update']), 'edit')).resolves.toBeUndefined();
  });

  it('throws not found when an event cannot be resolved', async () => {
    const service = new FrozenResourceService({
      event: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertEventMutable('event-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('checks event create targets for both event group and major event links', async () => {
    const prisma = {
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          events: [],
        }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          endDate: null,
        }),
      },
    };
    const service = new FrozenResourceService(prisma as unknown as PrismaService);

    await expect(
      service.assertEventCreateTargetsMutable({ eventGroupId: 'group-1', majorEventId: 'major-1' }, buildUser([])),
    ).resolves.toBeUndefined();

    expect(prisma.eventGroup.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'group-1',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'major-1',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it('checks changed event update relations and skips unchanged relation targets', async () => {
    const prisma = {
      event: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({
            createdAt: new Date('2026-05-01T12:00:00.000Z'),
            endDate: null,
          })
          .mockResolvedValueOnce({
            eventGroupId: 'group-old',
            majorEventId: 'major-old',
          }),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          events: [],
        }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          endDate: null,
        }),
      },
    };
    const service = new FrozenResourceService(prisma as unknown as PrismaService);

    await expect(
      service.assertEventUpdateMutable(
        'event-1',
        { eventGroupId: 'group-new', majorEventId: null },
        buildUser([]),
        true,
      ),
    ).resolves.toBeUndefined();

    expect(prisma.eventGroup.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.eventGroup.findFirst).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'group-old',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
    expect(prisma.eventGroup.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'group-new',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'major-old',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it('uses the latest linked event end date for event groups', async () => {
    const service = new FrozenResourceService({
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
          events: [
            {
              createdAt: new Date('2026-01-01T12:00:00.000Z'),
              endDate: new Date('2026-05-01T12:00:00.000Z'),
            },
          ],
        }),
      },
    } as unknown as PrismaService);

    await expect(service.assertEventGroupMutable('group-1', buildUser([]), 'edit')).resolves.toBeUndefined();
  });

  it('uses recent linked event creation dates for event groups', async () => {
    const service = new FrozenResourceService({
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
          events: [
            {
              createdAt: new Date('2026-05-01T12:00:00.000Z'),
              endDate: null,
            },
          ],
        }),
      },
    } as unknown as PrismaService);

    await expect(service.assertEventGroupMutable('group-1', buildUser([]), 'edit')).resolves.toBeUndefined();
  });

  it('throws not found when an event group cannot be resolved', async () => {
    const service = new FrozenResourceService({
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertEventGroupMutable('group-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws not found when a major event cannot be resolved', async () => {
    const service = new FrozenResourceService({
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertMajorEventMutable('major-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('uses certificate targets when checking certificate configs', async () => {
    const prisma = {
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue({
          scope: CertificateScope.MAJOR_EVENT,
          majorEventId: 'major-event-1',
          eventGroupId: null,
          eventId: null,
        }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
          endDate: new Date('2026-02-01T12:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService;
    const service = new FrozenResourceService(prisma);

    await expect(service.assertCertificateConfigMutable('config-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('freezes standalone certificate configs by their creation date', async () => {
    const service = new FrozenResourceService({
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue({
          scope: CertificateScope.OTHER,
          majorEventId: null,
          eventGroupId: null,
          eventId: null,
          folderId: 'folder-1',
          createdAt: new Date('2026-01-01T12:00:00.000Z'),
        }),
      },
    } as unknown as PrismaService);

    await expect(service.assertCertificateConfigMutable('config-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('throws not found when a certificate config cannot be resolved', async () => {
    const service = new FrozenResourceService({
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertCertificateConfigMutable('config-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('dispatches certificate targets by scope and ignores standalone target checks', async () => {
    const service = new FrozenResourceService({
      event: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          endDate: null,
        }),
      },
      eventGroup: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          events: [],
        }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          endDate: null,
        }),
      },
    } as unknown as PrismaService);

    await expect(service.assertCertificateTargetMutable(CertificateScope.EVENT, 'event-1', buildUser([]), 'edit'))
      .resolves.toBeUndefined();
    await expect(
      service.assertCertificateTargetMutable(CertificateScope.EVENT_GROUP, 'group-1', buildUser([]), 'edit'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertCertificateTargetMutable(CertificateScope.MAJOR_EVENT, 'major-1', buildUser([]), 'edit'),
    ).resolves.toBeUndefined();
    await expect(service.assertCertificateTargetMutable(CertificateScope.OTHER, 'folder-1', buildUser([]), 'edit'))
      .resolves.toBeUndefined();
  });

  it('resolves certificates through their certificate config', async () => {
    const prisma = {
      certificate: {
        findFirst: jest.fn().mockResolvedValue({ configId: 'config-1' }),
      },
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue({
          scope: CertificateScope.OTHER,
          majorEventId: null,
          eventGroupId: null,
          eventId: null,
          folderId: 'folder-1',
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
        }),
      },
    };
    const service = new FrozenResourceService(prisma as unknown as PrismaService);

    await expect(service.assertCertificateMutable('certificate-1', buildUser([]), 'edit')).resolves.toBeUndefined();

    expect(prisma.certificateConfig.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'config-1',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it('throws not found when a certificate cannot be resolved', async () => {
    const service = new FrozenResourceService({
      certificate: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertCertificateMutable('certificate-1', buildUser([]), 'edit')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('allows operations when no frozen certificate targets exist', async () => {
    const service = new FrozenResourceService({
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertNoFrozenCertificateTargets(buildUser([]), 'delete')).resolves.toBeUndefined();
  });

  it('requires delete override permission when frozen certificate targets exist', async () => {
    const service = new FrozenResourceService({
      certificateConfig: {
        findFirst: jest.fn().mockResolvedValue({ id: 'config-1' }),
      },
    } as unknown as PrismaService);

    await expect(service.assertNoFrozenCertificateTargets(buildUser([]), 'delete')).rejects.toThrow(
      FROZEN_DELETE_PERMISSION,
    );
  });

  it('allows frozen certificate targets when the user can bypass the operation', async () => {
    const user = buildUser([]);
    const authorizationPolicy = {
      canOverrideFrozenResource: jest.fn().mockResolvedValue(true),
    };
    const service = new FrozenResourceService(
      {
        certificateConfig: {
          findFirst: jest.fn().mockResolvedValue({ id: 'config-1' }),
        },
      } as unknown as PrismaService,
      authorizationPolicy as never,
    );

    await expect(service.assertNoFrozenCertificateTargets(user, 'delete')).resolves.toBeUndefined();
    expect(authorizationPolicy.canOverrideFrozenResource).toHaveBeenCalledWith(user, FROZEN_DELETE_PERMISSION, {});
  });

  it('resolves major event subscriptions through their major event', async () => {
    const prisma = {
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-1' }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          endDate: null,
        }),
      },
    };
    const service = new FrozenResourceService(prisma as unknown as PrismaService);

    await expect(service.assertMajorEventSubscriptionMutable('subscription-1', buildUser([]), 'edit'))
      .resolves.toBeUndefined();

    expect(prisma.majorEvent.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'major-1',
        deletedAt: null,
      },
      select: expect.any(Object),
    });
  });

  it('throws not found when a major event subscription cannot be resolved', async () => {
    const service = new FrozenResourceService({
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertMajorEventSubscriptionMutable('subscription-1', buildUser([]), 'edit'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('resolves receipt validation actions through their subscription', async () => {
    const prisma = {
      majorEventReceiptValidationAction: {
        findFirst: jest.fn().mockResolvedValue({ subscriptionId: 'subscription-1' }),
      },
      majorEventSubscription: {
        findFirst: jest.fn().mockResolvedValue({ majorEventId: 'major-1' }),
      },
      majorEvent: {
        findFirst: jest.fn().mockResolvedValue({
          createdAt: new Date('2026-05-01T12:00:00.000Z'),
          endDate: null,
        }),
      },
    };
    const service = new FrozenResourceService(prisma as unknown as PrismaService);

    await expect(service.assertReceiptValidationActionMutable('action-1', buildUser([]), 'edit'))
      .resolves.toBeUndefined();

    expect(prisma.majorEventSubscription.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'subscription-1',
        deletedAt: null,
      },
      select: {
        majorEventId: true,
      },
    });
  });

  it('throws not found when a receipt validation action cannot be resolved', async () => {
    const service = new FrozenResourceService({
      majorEventReceiptValidationAction: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService);

    await expect(service.assertReceiptValidationActionMutable('action-1', buildUser([]), 'edit'))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('checks certificate config bypass after resolving the target context', async () => {
    const user = buildUser([]);
    const authorizationPolicy = {
      canOverrideFrozenResource: jest.fn().mockResolvedValue(true),
    };
    const service = new FrozenResourceService(
      {
        certificateConfig: {
          findFirst: jest.fn().mockResolvedValue({
            scope: CertificateScope.MAJOR_EVENT,
            majorEventId: 'major-event-1',
            eventGroupId: null,
            eventId: null,
          }),
        },
        majorEvent: {
          findFirst: jest.fn().mockResolvedValue({
            createdAt: new Date('2026-01-01T12:00:00.000Z'),
            endDate: new Date('2026-02-01T12:00:00.000Z'),
          }),
        },
      } as unknown as PrismaService,
      authorizationPolicy as never,
    );

    await expect(service.assertCertificateConfigMutable('config-1', user, 'edit')).resolves.toBeUndefined();
    expect(authorizationPolicy.canOverrideFrozenResource).toHaveBeenCalledWith(user, FROZEN_EDIT_PERMISSION, {
      majorEventId: 'major-event-1',
    });
  });
});

function buildUser(permissions: string[]): AuthenticatedUser {
  return {
    realm_access: {
      roles: [],
    },
    token: 'token',
    roles: [],
    roleSet: new Set(),
    permissions,
    permissionSet: new Set(permissions),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: {},
  };
}
