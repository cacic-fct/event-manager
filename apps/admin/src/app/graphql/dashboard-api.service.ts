import { Injectable, inject } from '@angular/core';
import type { WorkspaceDashboardInsights } from '@cacic-fct/shared-frontend-types';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';
import { DASHBOARD_INCONSISTENCY_FIELDS } from './graphql-query-fragments';

type WorkspaceDashboardHomeInsights = Omit<WorkspaceDashboardInsights, 'permissions'>;

@Injectable({ providedIn: 'root' })
export class DashboardApiService {
  private readonly graphql = inject(GraphqlHttpService);

  getWorkspaceDashboardInsights() {
    return this.graphql
      .request<{ workspaceDashboardInsights: WorkspaceDashboardHomeInsights }>(
        `query WorkspaceDashboardInsights {
          workspaceDashboardInsights {
            generatedAt
            summary {
              eventsCount
              eventGroupsCount
              majorEventsCount
            }
            suggestions {
              action
              label
              targetId
            }
            calendarEvents {
              id
              name
              emoji
              type
              startDate
              endDate
              locationDescription
              majorEventName
              eventGroupName
              attendancesCount
              subscriptionsCount
              allowSubscription
              subscriptionStartDate
              subscriptionEndDate
              slots
              shouldCollectAttendance
              canCollectAttendanceNow
            }
            weatherAlerts {
              eventId
              eventName
              summary
              materialIcon
              forecastTime
              temperature
            }
            pendingCertificates {
              targetType
              targetId
              title
              subtitle
              finishedAt
            }
            pendingReceiptValidationsCount
            pendingReceiptMajorEvents {
              majorEventId
              name
              emoji
              startDate
              endDate
              pendingCount
            }
            pendingOfflineAttendancesCount
            pendingOfflineAttendanceEvents {
              eventId
              name
              emoji
              startDate
              endDate
              pendingCount
            }
            inconsistencies {
              ${DASHBOARD_INCONSISTENCY_FIELDS}
            }
            duplicatePeopleCount
          }
        }`,
      )
      .pipe(map((data) => data.workspaceDashboardInsights));
  }
}
