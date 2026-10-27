import { DashboardCalendarEvent } from '../models';
import { formatEventLocation } from '@cacic-fct/shared-utils';
import { TWO_HOURS_MS } from './constants';
import { type InsightEvent } from './insight-event.select';

export function mapCalendarEvent(event: InsightEvent, now: Date): DashboardCalendarEvent {
  return {
    id: event.id,
    name: event.name,
    emoji: event.emoji,
    type: event.type,
    startDate: event.startDate,
    endDate: event.endDate,
    locationDescription: formatEventLocation(event),
    majorEventName: event.majorEvent?.name ?? null,
    eventGroupName: event.eventGroup?.name ?? null,
    attendancesCount: event._count.attendances,
    subscriptionsCount: event._count.subscriptions,
    allowSubscription: event.allowSubscription,
    subscriptionStartDate: event.subscriptionStartDate,
    subscriptionEndDate: event.subscriptionEndDate,
    slots: event.slots,
    shouldCollectAttendance: event.shouldCollectAttendance,
    canCollectAttendanceNow:
      event.shouldCollectAttendance &&
      event.startDate.getTime() <= now.getTime() + TWO_HOURS_MS &&
      event.endDate.getTime() >= now.getTime() - TWO_HOURS_MS,
  };
}
