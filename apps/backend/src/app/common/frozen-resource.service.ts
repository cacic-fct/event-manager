import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Permission } from '@cacic-fct/shared-permissions';
import { CertificateScope } from '@prisma/client';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

export type FrozenOperation = 'edit' | 'delete';

export const FROZEN_EDIT_PERMISSION = Permission.Frozen.Update;
export const FROZEN_DELETE_PERMISSION = Permission.Frozen.Delete;

export function getFrozenCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - 2);
  return cutoff;
}

export function getLatestDate(dates: Array<Date | null | undefined>): Date | null {
  const timestamps = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime())
    .filter((timestamp) => Number.isFinite(timestamp));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps));
}

export function isFrozenFromDates(dates: Array<Date | null | undefined>, now = new Date()): boolean {
  const latestDate = getLatestDate(dates);
  return latestDate ? latestDate < getFrozenCutoffDate(now) : false;
}

@Injectable()
export class FrozenResourceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authorizationPolicy: AuthorizationPolicyService = {
      canOverrideFrozenResource: async (user: AuthenticatedUser | undefined, permission: Permission) =>
        Boolean(user?.permissionSet?.has(permission) || user?.permissions?.includes(permission)),
    } as AuthorizationPolicyService,
  ) {}

  async assertEventMutable(
    eventId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
    includeDeleted = false,
  ): Promise<void> {
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        createdAt: true,
        endDate: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    if (await this.canBypass(user, operation, { eventId })) {
      return;
    }

    this.assertDatesMutable([event.createdAt, event.endDate], operation);
  }

  async assertEventCreateTargetsMutable(
    input: {
      eventGroupId?: string | null;
      majorEventId?: string | null;
    },
    user: AuthenticatedUser | undefined,
  ): Promise<void> {
    if (input.eventGroupId) {
      await this.assertEventGroupMutable(input.eventGroupId, user, 'edit');
    }

    if (input.majorEventId) {
      await this.assertMajorEventMutable(input.majorEventId, user, 'edit');
    }
  }

  async assertEventUpdateMutable(
    eventId: string,
    input: {
      eventGroupId?: string | null;
      majorEventId?: string | null;
    },
    user: AuthenticatedUser | undefined,
    includeDeleted = false,
  ): Promise<void> {
    await this.assertEventMutable(eventId, user, 'edit', includeDeleted);

    if (input.eventGroupId === undefined && input.majorEventId === undefined) {
      return;
    }

    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        eventGroupId: true,
        majorEventId: true,
      },
    });

    if (!event) {
      throw new NotFoundException(`Event ${eventId} was not found.`);
    }

    const groupIds = this.changedRelationIds(event.eventGroupId, input.eventGroupId);
    for (const groupId of groupIds) {
      await this.assertEventGroupMutable(groupId, user, 'edit');
    }

    const majorEventIds = this.changedRelationIds(event.majorEventId, input.majorEventId);
    for (const majorEventId of majorEventIds) {
      await this.assertMajorEventMutable(majorEventId, user, 'edit');
    }
  }

  async assertEventGroupMutable(
    eventGroupId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
    includeDeleted = false,
  ): Promise<void> {
    const eventGroup = await this.prisma.eventGroup.findFirst({
      where: {
        id: eventGroupId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        createdAt: true,
        events: {
          where: {
            deletedAt: null,
          },
          select: {
            createdAt: true,
            endDate: true,
          },
        },
      },
    });

    if (!eventGroup) {
      throw new NotFoundException(`Event group ${eventGroupId} was not found.`);
    }

    if (await this.canBypass(user, operation, { eventGroupId })) {
      return;
    }

    this.assertDatesMutable(
      [eventGroup.createdAt, ...eventGroup.events.flatMap((event) => [event.createdAt, event.endDate])],
      operation,
    );
  }

  async assertMajorEventMutable(
    majorEventId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
    includeDeleted = false,
  ): Promise<void> {
    const majorEvent = await this.prisma.majorEvent.findFirst({
      where: {
        id: majorEventId,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      select: {
        createdAt: true,
        endDate: true,
      },
    });

    if (!majorEvent) {
      throw new NotFoundException(`Major event ${majorEventId} was not found.`);
    }

    if (await this.canBypass(user, operation, { majorEventId })) {
      return;
    }

    this.assertDatesMutable([majorEvent.createdAt, majorEvent.endDate], operation);
  }

  async assertCertificateTargetMutable(
    scope: CertificateScope | string,
    targetId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
  ): Promise<void> {
    if (scope === CertificateScope.EVENT) {
      await this.assertEventMutable(targetId, user, operation);
      return;
    }

    if (scope === CertificateScope.EVENT_GROUP) {
      await this.assertEventGroupMutable(targetId, user, operation);
      return;
    }

    if (scope === CertificateScope.MAJOR_EVENT) {
      await this.assertMajorEventMutable(targetId, user, operation);
    }
  }

  async assertCertificateConfigMutable(
    configId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
  ): Promise<void> {
    const config = await this.prisma.certificateConfig.findFirst({
      where: {
        id: configId,
        deletedAt: null,
      },
      select: {
        scope: true,
        eventId: true,
        eventGroupId: true,
        majorEventId: true,
      },
    });

    if (!config) {
      throw new NotFoundException(`Certificate config ${configId} not found.`);
    }

    const targetId = config.eventId ?? config.eventGroupId ?? config.majorEventId;
    if (targetId) {
      await this.assertCertificateTargetMutable(config.scope, targetId, user, operation);
    }
  }

  async assertCertificateMutable(
    certificateId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
  ): Promise<void> {
    const certificate = await this.prisma.certificate.findFirst({
      where: {
        id: certificateId,
        deletedAt: null,
      },
      select: {
        configId: true,
      },
    });

    if (!certificate) {
      throw new NotFoundException(`Certificate ${certificateId} not found.`);
    }

    await this.assertCertificateConfigMutable(certificate.configId, user, operation);
  }

  async assertNoFrozenCertificateTargets(user: AuthenticatedUser | undefined, operation: FrozenOperation): Promise<void> {
    const cutoff = getFrozenCutoffDate();
    const frozenConfig = await this.prisma.certificateConfig.findFirst({
      where: {
        deletedAt: null,
        OR: [
          {
            scope: CertificateScope.EVENT,
            event: {
              deletedAt: null,
              createdAt: {
                lt: cutoff,
              },
              endDate: {
                lt: cutoff,
              },
            },
          },
          {
            scope: CertificateScope.MAJOR_EVENT,
            majorEvent: {
              deletedAt: null,
              createdAt: {
                lt: cutoff,
              },
              endDate: {
                lt: cutoff,
              },
            },
          },
          {
            scope: CertificateScope.EVENT_GROUP,
            eventGroup: {
              deletedAt: null,
              createdAt: {
                lt: cutoff,
              },
              events: {
                none: {
                  deletedAt: null,
                  OR: [
                    {
                      createdAt: {
                        gte: cutoff,
                      },
                    },
                    {
                      endDate: {
                        gte: cutoff,
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      select: {
        id: true,
      },
    });

    if (!frozenConfig) {
      return;
    }

    if (await this.canBypass(user, operation)) {
      return;
    }

    this.throwFrozen(operation);
  }

  async assertMajorEventSubscriptionMutable(
    subscriptionId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
  ): Promise<void> {
    const subscription = await this.prisma.majorEventSubscription.findFirst({
      where: {
        id: subscriptionId,
        deletedAt: null,
      },
      select: {
        majorEventId: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException(`Subscription ${subscriptionId} was not found.`);
    }

    await this.assertMajorEventMutable(subscription.majorEventId, user, operation);
  }

  async assertReceiptValidationActionMutable(
    actionId: string,
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
  ): Promise<void> {
    const action = await this.prisma.majorEventReceiptValidationAction.findFirst({
      where: {
        id: actionId,
        undoneAt: null,
      },
      select: {
        subscriptionId: true,
      },
    });

    if (!action) {
      throw new NotFoundException(`Receipt validation action ${actionId} was not found.`);
    }

    await this.assertMajorEventSubscriptionMutable(action.subscriptionId, user, operation);
  }

  private assertDatesMutable(dates: Array<Date | null | undefined>, operation: FrozenOperation): void {
    if (isFrozenFromDates(dates)) {
      this.throwFrozen(operation);
    }
  }

  private throwFrozen(operation: FrozenOperation): never {
    const permission = operation === 'delete' ? FROZEN_DELETE_PERMISSION : FROZEN_EDIT_PERMISSION;
    throw new ForbiddenException(
      `Dados congelados. Esta operação exige a permissão ${permission}.`,
    );
  }

  private canBypass(
    user: AuthenticatedUser | undefined,
    operation: FrozenOperation,
    context = {},
  ): Promise<boolean> {
    const permission = operation === 'delete' ? Permission.Frozen.Delete : Permission.Frozen.Update;
    return this.authorizationPolicy.canOverrideFrozenResource(user, permission, context);
  }

  private changedRelationIds(currentId: string | null, nextId: string | null | undefined): string[] {
    if (nextId === undefined || currentId === nextId) {
      return [];
    }

    return [...new Set([currentId, nextId].filter((id): id is string => Boolean(id)))];
  }
}
