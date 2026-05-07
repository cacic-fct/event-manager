import { Injectable, inject } from '@angular/core';
import type { WorkspaceDashboardInsights } from '@cacic-eventos/shared-frontend-types';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';

type WorkspaceDashboardHomeInsights = Omit<
  WorkspaceDashboardInsights,
  'permissions'
>;

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
            inconsistencies {
              type
              severity
              title
              description
              eventId
              relatedEventId
              personId
            }
            duplicatePeopleCount
          }
        }`,
      )
      .pipe(map((data) => data.workspaceDashboardInsights));
  }
}
