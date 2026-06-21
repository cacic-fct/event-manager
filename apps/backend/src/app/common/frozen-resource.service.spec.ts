import { ForbiddenException } from '@nestjs/common';
import { CertificateScope } from '@prisma/client';
import { FROZEN_EDIT_PERMISSION, FrozenResourceService, isFrozenFromDates } from './frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';

describe('FrozenResourceService', () => {
  const now = new Date('2026-06-01T12:00:00.000Z');

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
