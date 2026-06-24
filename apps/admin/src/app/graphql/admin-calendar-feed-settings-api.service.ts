import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { GraphqlHttpService } from './graphql-http.service';

export interface CurrentUserAdminCalendarFeedSettings {
  enabled: boolean;
  feedPath?: string | null;
  disabledAt?: string | null;
  disabledReason?: string | null;
}

export interface SuperAdminCalendarFeedSettings {
  enabled: boolean;
  feedPath?: string | null;
  lastFetchedAt?: string | null;
  rotatedAt?: string | null;
  updatedAt?: string | null;
}

const CURRENT_USER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS = `
  enabled
  feedPath
  disabledAt
  disabledReason
`;

const SUPER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS = `
  enabled
  feedPath
  lastFetchedAt
  rotatedAt
  updatedAt
`;

@Injectable({ providedIn: 'root' })
export class AdminCalendarFeedSettingsApiService {
  private readonly graphql = inject(GraphqlHttpService);

  getCurrentUserAdminSettings() {
    return this.graphql
      .request<{ currentUserAdminCalendarFeedSettings: CurrentUserAdminCalendarFeedSettings }>(
        `
          query CurrentUserAdminCalendarFeedSettings {
            currentUserAdminCalendarFeedSettings {
              ${CURRENT_USER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS}
            }
          }
        `,
      )
      .pipe(map((data) => data.currentUserAdminCalendarFeedSettings));
  }

  setCurrentUserAdminEnabled(enabled: boolean) {
    return this.graphql
      .request<{ setCurrentUserAdminCalendarFeedEnabled: CurrentUserAdminCalendarFeedSettings }>(
        `
          mutation SetCurrentUserAdminCalendarFeedEnabled($enabled: Boolean!) {
            setCurrentUserAdminCalendarFeedEnabled(enabled: $enabled) {
              ${CURRENT_USER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS}
            }
          }
        `,
        { enabled },
      )
      .pipe(map((data) => data.setCurrentUserAdminCalendarFeedEnabled));
  }

  rotateCurrentUserAdminKey() {
    return this.graphql
      .request<{ rotateCurrentUserAdminCalendarFeedKey: CurrentUserAdminCalendarFeedSettings }>(
        `
          mutation RotateCurrentUserAdminCalendarFeedKey {
            rotateCurrentUserAdminCalendarFeedKey {
              ${CURRENT_USER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS}
            }
          }
        `,
      )
      .pipe(map((data) => data.rotateCurrentUserAdminCalendarFeedKey));
  }

  getSuperAdminSettings() {
    return this.graphql
      .request<{ superAdminCalendarFeedSettings: SuperAdminCalendarFeedSettings }>(
        `
          query SuperAdminCalendarFeedSettings {
            superAdminCalendarFeedSettings {
              ${SUPER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS}
            }
          }
        `,
      )
      .pipe(map((data) => data.superAdminCalendarFeedSettings));
  }

  rotateSuperAdminKey() {
    return this.graphql
      .request<{ rotateSuperAdminCalendarFeedKey: SuperAdminCalendarFeedSettings }>(
        `
          mutation RotateSuperAdminCalendarFeedKey {
            rotateSuperAdminCalendarFeedKey {
              ${SUPER_ADMIN_CALENDAR_FEED_SETTINGS_FIELDS}
            }
          }
        `,
      )
      .pipe(map((data) => data.rotateSuperAdminCalendarFeedKey));
  }
}
