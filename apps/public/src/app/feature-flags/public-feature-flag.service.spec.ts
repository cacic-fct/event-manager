import { TestBed } from '@angular/core/testing';
import { OfflineFeatureFlagCacheRecord, OfflinePublicDatabaseProvider } from '@cacic-fct/offline-public-data-access';
import { PUBLIC_FEATURE_FLAG_CONFIG } from './public-feature-flag.config';
import { PublicFeatureFlagService } from './public-feature-flag.service';
import { PUBLIC_FEATURE_FLAGS } from './public-feature-flags';

class FeatureFlagCacheTableMock {
  private readonly records = new Map<string, OfflineFeatureFlagCacheRecord>();

  seed(record: OfflineFeatureFlagCacheRecord): void {
    this.records.set(record.key, record);
  }

  get(key: string): Promise<OfflineFeatureFlagCacheRecord | undefined> {
    return Promise.resolve(this.records.get(key));
  }

  put(record: OfflineFeatureFlagCacheRecord): Promise<string> {
    this.records.set(record.key, record);
    return Promise.resolve(record.key);
  }

  where(): { below: (timestamp: number) => { delete: () => Promise<number> } } {
    return {
      below: (timestamp) => ({
        delete: async () => {
          const expired = [...this.records.values()].filter((record) => record.updatedAt < timestamp);
          expired.forEach((record) => this.records.delete(record.key));
          return expired.length;
        },
      }),
    };
  }
}

describe('PublicFeatureFlagService', () => {
  let cache: FeatureFlagCacheTableMock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-21T12:00:00.000Z'));
    cache = new FeatureFlagCacheTableMock();

    TestBed.configureTestingModule({
      providers: [
        {
          provide: OfflinePublicDatabaseProvider,
          useValue: {
            getDatabase: () => ({
              featureFlagCache: cache,
            }),
          },
        },
        {
          provide: PUBLIC_FEATURE_FLAG_CONFIG,
          useValue: {
            url: 'https://unleash.cacic.dev.br/api/frontend',
            clientKey: '',
            appName: 'events-public',
            environment: 'production',
            refreshIntervalSeconds: 60,
            disableMetrics: true,
          },
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses hardcoded defaults when no cached flags are available', async () => {
    const service = TestBed.inject(PublicFeatureFlagService);

    await service.initialize();

    expect(service.booleanValue('calendarTabEnabled')).toBe(true);
    expect(service.stringValue('defaultLoginRedirectPath')).toBe('/calendar');
  });

  it('loads cached flags from IndexedDB before Unleash is configured', async () => {
    cache.seed({
      key: 'repo',
      updatedAt: Date.now(),
      value: [
        {
          name: PUBLIC_FEATURE_FLAGS.calendarTabEnabled,
          enabled: false,
          impressionData: false,
          variant: { name: 'disabled', enabled: false, feature_enabled: false },
        },
        {
          name: PUBLIC_FEATURE_FLAGS.defaultLoginRedirectPath,
          enabled: true,
          impressionData: false,
          variant: {
            name: 'menu',
            enabled: true,
            feature_enabled: true,
            payload: { type: 'string', value: '/menu' },
          },
        },
      ],
    });

    const service = TestBed.inject(PublicFeatureFlagService);

    await service.initialize();

    expect(service.booleanValue('calendarTabEnabled')).toBe(false);
    expect(service.stringValue('defaultLoginRedirectPath')).toBe('/menu');
  });

  it('purges cached flags older than 3 months', async () => {
    cache.seed({
      key: 'repo',
      updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 93,
      value: [
        {
          name: PUBLIC_FEATURE_FLAGS.calendarTabEnabled,
          enabled: false,
          impressionData: false,
          variant: { name: 'disabled', enabled: false, feature_enabled: false },
        },
      ],
    });

    const service = TestBed.inject(PublicFeatureFlagService);

    await service.initialize();

    expect(service.booleanValue('calendarTabEnabled')).toBe(true);
  });
});
