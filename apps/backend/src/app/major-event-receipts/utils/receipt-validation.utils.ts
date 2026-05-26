import { BadRequestException } from '@nestjs/common';
import { SubscriptionStatus } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { ReceiptRejectionCode } from '../receipt.types';

export function getScheduleConflictEventIds(events: Array<{ id: string; startDate: Date; endDate: Date }>): Set<string> {
  const conflictIds = new Set<string>();
  for (const event of events) {
    for (const otherEvent of events) {
      if (event.id === otherEvent.id) {
        continue;
      }
      if (event.startDate < otherEvent.endDate && otherEvent.startDate < event.endDate) {
        conflictIds.add(event.id);
        conflictIds.add(otherEvent.id);
      }
    }
  }
  return conflictIds;
}

export function rejectionStatus(rejectionCode: ReceiptRejectionCode): SubscriptionStatus {
  switch (rejectionCode) {
    case 'INVALID_RECEIPT':
      return SubscriptionStatus.REJECTED_INVALID_RECEIPT;
    case 'NO_SLOTS':
      return SubscriptionStatus.REJECTED_NO_SLOTS;
    case 'SCHEDULE_CONFLICT':
      return SubscriptionStatus.REJECTED_SCHEDULE_CONFLICT;
    case 'GENERIC':
      return SubscriptionStatus.REJECTED_GENERIC;
  }
}

export function normalizeRejectionReason(reason: string | undefined): string | null {
  const normalized = reason?.trim();
  return normalized ? normalized : null;
}

export function getActorId(authenticatedUser: AuthenticatedUser): string {
  return authenticatedUser.sub ?? authenticatedUser.email ?? '';
}

export function normalizeRequestedEventIds(requestedEventIds: string[], allowedEventIds: string[]): string[] {
  const allowedEventIdSet = new Set(allowedEventIds);
  const normalized = [...new Set(requestedEventIds.map((eventId) => eventId.trim()).filter(Boolean))];
  const invalidEventIds = normalized.filter((eventId) => !allowedEventIdSet.has(eventId));
  if (invalidEventIds.length > 0) {
    throw new BadRequestException(`Invalid events for receipt approval: ${invalidEventIds.join(', ')}.`);
  }
  return normalized;
}

export function countReceiptEventsByCategory(events: Array<{ type: string }>): {
  course: number;
  lecture: number;
  uncategorized: number;
} {
  return events.reduce(
    (counts, event) => {
      if (event.type === 'MINICURSO') {
        counts.course += 1;
      } else if (event.type === 'PALESTRA') {
        counts.lecture += 1;
      } else {
        counts.uncategorized += 1;
      }
      return counts;
    },
    { course: 0, lecture: 0, uncategorized: 0 },
  );
}
