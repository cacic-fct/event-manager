import { createHash } from 'node:crypto';
import { EventOralAttendanceInput } from '@cacic-fct/shared-data-types';

export function buildOfflineOralAttendanceReceiptMarker(input: Pick<
  EventOralAttendanceInput,
  'clientId' | 'eventId' | 'personId' | 'status' | 'collectedAt'
>): string {
  return `oral-attendance-receipt:${createHash('sha256')
    .update(
      JSON.stringify({
        clientId: input.clientId,
        eventId: input.eventId,
        personId: input.personId,
        status: input.status,
        collectedAt: input.collectedAt.toISOString(),
      }),
    )
    .digest('hex')}`;
}
