import { DashboardCalendarEvent } from '../models';
import { TWO_HOURS_MS } from './constants';
import { InsightEvent } from './insight-event.select';

export function mapCalendarEvent(event: InsightEvent, now: Date): DashboardCalendarEvent {
  return {
    id: event.id,
    name: event.name,
    emoji: event.emoji,
    type: event.type,
    startDate: event.startDate,
    endDate: event.endDate,
    locationDescription: event.locationDescription,
    majorEventName: event.majorEvent?.name ?? null,
    eventGroupName: event.eventGroup?.name ?? null,
    attendancesCount: event._count.attendances,
    subscriptionsCount: event._count.subscriptions,
    shouldCollectAttendance: event.shouldCollectAttendance,
    canCollectAttendanceNow:
      event.shouldCollectAttendance &&
      event.startDate.getTime() <= now.getTime() + TWO_HOURS_MS &&
      event.endDate.getTime() >= now.getTime() - TWO_HOURS_MS,
  };
}
