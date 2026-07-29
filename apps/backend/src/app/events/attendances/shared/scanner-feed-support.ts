import { EventAttendanceScannerFeedItem } from '@cacic-fct/shared-data-types';
import {
  getAttendanceOralRoster,
  getAttendanceScannerFeed,
} from '../../../current-user/events/attendance-collection-feed';
import { EventAttendancesSubscriptionImportSupport } from './subscription-import-support';

export abstract class EventAttendancesScannerFeedSupport extends EventAttendancesSubscriptionImportSupport {
  protected async getScannerFeed(eventId: string): Promise<EventAttendanceScannerFeedItem[]> {
    return getAttendanceScannerFeed(this.prisma, eventId);
  }

  protected async getOralRoster(eventId: string): Promise<EventAttendanceScannerFeedItem[]> {
    return getAttendanceOralRoster(this.prisma, eventId);
  }
}
