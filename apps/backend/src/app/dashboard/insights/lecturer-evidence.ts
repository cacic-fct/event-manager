import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CONSISTENCY_EVENT_SELECT, type ConsistencyInsightEvent } from './insight-event.select';

type ConsistencyEventRecord = Prisma.EventGetPayload<{ select: typeof CONSISTENCY_EVENT_SELECT }>;
type LecturerEvidence = Pick<ConsistencyInsightEvent, 'subscriptions' | 'attendances'>;
const EVENT_BATCH_SIZE = 100;

export async function loadLecturerEvidence(
  prisma: PrismaService,
  events: readonly ConsistencyEventRecord[],
): Promise<ConsistencyInsightEvent[]> {
  const evidenceByEvent = new Map<string, LecturerEvidence>(
    events.map((event) => [event.id, { subscriptions: [], attendances: [] }]),
  );
  const lecturerEvents = events.filter((event) => !event.sportsMatch && event.lecturers.length > 0);
  for (let offset = 0; offset < lecturerEvents.length; offset += EVENT_BATCH_SIZE) {
    const scopes = lecturerEvents.slice(offset, offset + EVENT_BATCH_SIZE).map((event) => ({
      eventId: event.id,
      personId: { in: event.lecturers.map((lecturer) => lecturer.personId) },
    }));
    const [subscriptions, attendances] = await Promise.all([
      prisma.eventSubscription.findMany({
        where: { deletedAt: null, OR: scopes },
        select: { eventId: true, personId: true },
      }),
      prisma.eventAttendance.findMany({
        where: { status: 'PRESENT', OR: scopes },
        select: { eventId: true, personId: true },
      }),
    ]);
    for (const subscription of subscriptions) {
      evidenceByEvent.get(subscription.eventId)?.subscriptions.push({ personId: subscription.personId });
    }
    for (const attendance of attendances) {
      evidenceByEvent.get(attendance.eventId)?.attendances.push({ personId: attendance.personId });
    }
  }
  return events.map((event) => ({
    ...event,
    subscriptions: evidenceByEvent.get(event.id)?.subscriptions ?? [],
    attendances: evidenceByEvent.get(event.id)?.attendances ?? [],
  }));
}
