import 'fake-indexeddb/auto';
import '@angular/compiler';
import { EnvironmentInjector, createEnvironmentInjector, runInInjectionContext } from '@angular/core';
import Dexie from 'dexie';
import { MyDayCacheService } from './my-day-cache.service';
import { PublicDataDatabase } from './public-data-schema';
import { PublicDatabaseProvider } from './public-database-provider';

describe('MyDayCacheService', () => {
  const databaseName = 'cacic-public-my-day-cache-tests';
  let database: PublicDataDatabase;
  let injector: EnvironmentInjector;
  let service: MyDayCacheService;

  beforeEach(async () => {
    await Dexie.delete(databaseName);
    database = new PublicDataDatabase(databaseName);
    injector = createEnvironmentInjector(
      [{ provide: PublicDatabaseProvider, useValue: { getDatabase: () => database } }, MyDayCacheService],
      null as unknown as EnvironmentInjector,
    );
    service = runInInjectionContext(injector, () => new MyDayCacheService());
  });

  afterEach(async () => {
    injector?.destroy();
    database?.close();
    await Dexie.delete(databaseName);
  });

  it('isolates selected-day projections by user and date', async () => {
    const data = {
      generatedAt: '2026-08-16T12:00:00.000Z',
      selectedDate: '2026-08-16',
      minimumDate: '2026-07-16',
      hasContent: true,
      currentEvent: null,
      nextEvent: null,
      laterEvents: [],
      attention: [],
      weather: [],
    };

    await service.put('user-1', data);

    await expect(service.get('user-1', '2026-08-16')).resolves.toEqual(data);
    await expect(service.get('user-2', '2026-08-16')).resolves.toBeNull();
  });
});
