import { Injectable, inject } from '@angular/core';
import { liveQuery } from 'dexie';
import { Observable, from, map, of } from 'rxjs';
import type { CalendarDefaultItemViewPreference } from './offline-public-data-schema';
import { OfflinePublicDatabaseProvider } from './offline-public-database-provider';

const CALENDAR_PREFERENCES_KEY = 'calendar';
const DEFAULT_ITEM_VIEW: CalendarDefaultItemViewPreference = 'automatic';

@Injectable({ providedIn: 'root' })
export class CalendarPreferencesStorageService {
  private readonly databaseProvider = inject(OfflinePublicDatabaseProvider);

  watchDefaultItemView(): Observable<CalendarDefaultItemViewPreference> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return of(DEFAULT_ITEM_VIEW);
    }

    return from(liveQuery(() => database.calendarPreferences.get(CALENDAR_PREFERENCES_KEY))).pipe(
      map((record) => record?.defaultItemView ?? DEFAULT_ITEM_VIEW),
    );
  }

  async getDefaultItemView(): Promise<CalendarDefaultItemViewPreference> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return DEFAULT_ITEM_VIEW;
    }

    const record = await database.calendarPreferences.get(CALENDAR_PREFERENCES_KEY);

    return record?.defaultItemView ?? DEFAULT_ITEM_VIEW;
  }

  async setDefaultItemView(defaultItemView: CalendarDefaultItemViewPreference): Promise<void> {
    const database = this.databaseProvider.getDatabase();
    if (!database) {
      return;
    }

    await database.calendarPreferences.put({
      key: CALENDAR_PREFERENCES_KEY,
      defaultItemView,
      updatedAt: Date.now(),
    });
  }
}
