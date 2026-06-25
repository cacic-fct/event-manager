import { EventAttendanceScannerFeedItem } from '@cacic-fct/shared-data-types';
import { EventAttendancesSubscriptionImportSupport } from './subscription-import-support';

export abstract class EventAttendancesScannerFeedSupport extends EventAttendancesSubscriptionImportSupport {
  protected async getScannerFeed(eventId: string): Promise<EventAttendanceScannerFeedItem[]> {
    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId,
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdById: true,
        committedById: true,
        createdByMethod: true,
        person: {
          select: {
            name: true,
            user: {
              select: {
                unespRole: true,
              },
            },
          },
        },
        event: {
          select: {
            allowSubscription: true,
            majorEventId: true,
          },
        },
      },
      orderBy: {
        attendedAt: 'desc',
      },
      take: 80,
    });

    const majorEventId = attendances.find((attendance) => attendance.event.majorEventId)?.event.majorEventId;
    const personIds = attendances.map((attendance) => attendance.personId);
    const collectorIds = [
      ...new Set(
        attendances
          .flatMap((attendance) => [attendance.createdById, attendance.committedById])
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const standaloneEventIds = [
      ...new Set(
        attendances
          .filter((attendance) => attendance.event.allowSubscription && !attendance.event.majorEventId)
          .map((attendance) => attendance.eventId),
      ),
    ];

    const [majorEventSubscriptions, standaloneEventSubscriptions, collectors] = await Promise.all([
      majorEventId
        ? this.prisma.majorEventSubscription.findMany({
            where: {
              majorEventId,
              personId: {
                in: personIds,
              },
              deletedAt: null,
            },
            select: {
              personId: true,
              subscriptionStatus: true,
            },
          })
        : Promise.resolve([]),
      standaloneEventIds.length
        ? this.prisma.eventSubscription.findMany({
            where: {
              eventId: {
                in: standaloneEventIds,
              },
              personId: {
                in: personIds,
              },
              deletedAt: null,
            },
            select: {
              eventId: true,
              personId: true,
            },
          })
        : Promise.resolve([]),
      collectorIds.length
        ? this.prisma.user.findMany({
            where: {
              id: {
                in: collectorIds,
              },
            },
            select: {
              id: true,
              name: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const majorEventSubscriptionStatusByPersonId = new Map(
      majorEventSubscriptions.map((subscription) => [subscription.personId, subscription.subscriptionStatus]),
    );
    const standaloneEventSubscriptionKeys = new Set(
      standaloneEventSubscriptions.map((subscription) => `${subscription.personId}:${subscription.eventId}`),
    );
    const collectorFirstNameById = new Map(
      collectors.map((collector) => [collector.id, this.getFirstName(collector.name)]),
    );

    return attendances.map((attendance) => ({
      personId: attendance.personId,
      eventId: attendance.eventId,
      fullName: attendance.person?.name ?? undefined,
      unespRole: this.formatUnespRole(attendance.person?.user?.unespRole),
      subscriptionStatus:
        majorEventSubscriptionStatusByPersonId.get(attendance.personId) ??
        (standaloneEventSubscriptionKeys.has(`${attendance.personId}:${attendance.eventId}`) ? 'CONFIRMED' : undefined),
      attendedAt: attendance.attendedAt,
      createdByMethod: attendance.createdByMethod,
      collectedByFirstName: attendance.createdById ? (collectorFirstNameById.get(attendance.createdById) ?? undefined) : undefined,
      committedByFirstName:
        attendance.committedById && attendance.committedById !== attendance.createdById
          ? (collectorFirstNameById.get(attendance.committedById) ?? undefined)
          : undefined,
    }));
  }

  private formatUnespRole(role: readonly string[] | null | undefined): string | undefined {
    return role?.length ? role.join(', ') : undefined;
  }
}
