import { Controller, MessageEvent, Param, Sse } from '@nestjs/common';
import { AttendanceCreationMethod, SubscriptionStatus } from '@prisma/client';
import { Observable, interval, map, startWith, switchMap } from 'rxjs';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { PrismaService } from '../prisma/prisma.service';

interface EventAttendanceScannerFeedItem {
  personId: string;
  eventId: string;
  fullName: string | null;
  unespRole: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  attendedAt: Date | null;
  createdByMethod: AttendanceCreationMethod | null;
  collectedByFirstName: string | null;
}

@Controller('event-attendances')
export class EventAttendancesController {
  constructor(private readonly prisma: PrismaService) {}

  @Sse('events/:eventId/scanner-feed/events')
  @RequireScopes('event-attendance#read')
  streamScannerFeed(@Param('eventId') eventId: string): Observable<MessageEvent> {
    return interval(2_000).pipe(
      startWith(0),
      switchMap(() => this.getScannerFeed(eventId)),
      map((attendances) => ({
        data: {
          type: 'event-attendance-scanner-feed',
          attendances,
        },
      })),
    );
  }

  private async getScannerFeed(eventId: string): Promise<EventAttendanceScannerFeedItem[]> {
    const attendances = await this.prisma.eventAttendance.findMany({
      where: {
        eventId,
      },
      select: {
        personId: true,
        eventId: true,
        attendedAt: true,
        createdById: true,
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
      ...new Set(attendances.map((attendance) => attendance.createdById).filter((id): id is string => Boolean(id))),
    ];

    const [subscriptions, collectors] = await Promise.all([
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

    const subscriptionStatusByPersonId = new Map(
      subscriptions.map((subscription) => [subscription.personId, subscription.subscriptionStatus]),
    );
    const collectorFirstNameById = new Map(
      collectors.map((collector) => [collector.id, this.getFirstName(collector.name)]),
    );

    return attendances.map((attendance) => ({
      personId: attendance.personId,
      eventId: attendance.eventId,
      fullName: attendance.person?.name ?? null,
      unespRole: this.formatUnespRole(attendance.person?.user?.unespRole),
      subscriptionStatus: subscriptionStatusByPersonId.get(attendance.personId) ?? null,
      attendedAt: attendance.attendedAt,
      createdByMethod: attendance.createdByMethod,
      collectedByFirstName: attendance.createdById ? (collectorFirstNameById.get(attendance.createdById) ?? null) : null,
    }));
  }

  private getFirstName(name: string): string {
    return name.trim().split(/\s+/)[0] || name;
  }

  private formatUnespRole(role: readonly string[] | null | undefined): string | null {
    return role?.length ? role.join(', ') : null;
  }
}
