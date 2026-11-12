import {
  UMAMI_BROWSER_EVENT_PATH,
  UMAMI_BROWSER_WEBSITE_IDS,
  UMAMI_EVENTS,
  UMAMI_OPERATIONS_EVENT_PATH,
  type UmamiAnalyticsEvent,
  type UsageDashboard,
  type UsageReport,
  type UmamiAnalyticsSource,
  type UmamiOperationsEvent,
} from '@cacic-fct/shared-analytics';
import { BadGatewayException, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const REQUEST_TIMEOUT_MS = 3_000;
const DEFAULT_DASHBOARD_BASE_URL = 'https://analytics.cacic.com.br/';
const REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
const DEPENDENCY_EVENTS = {
  database: { down: 'database_unavailable', up: 'database_recovered' },
  redis: { down: 'redis_unavailable', up: 'redis_recovered' },
} as const;

type Dependency = keyof typeof DEPENDENCY_EVENTS;

@Injectable()
export class UmamiAnalyticsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(UmamiAnalyticsService.name);
  private readonly apiBase: URL | null;
  private readonly dashboardBase: URL | null;
  private readonly operationsWebsiteId: string | undefined;
  private readonly readApiKey: string | undefined;
  private readonly readiness: Partial<Record<Dependency, boolean>> = {};

  constructor(config: ConfigService) {
    this.apiBase = this.readBaseUrl('UMAMI_API_BASE_URL', config.get<string>('UMAMI_API_BASE_URL'));
    this.dashboardBase = this.readBaseUrl(
      'UMAMI_DASHBOARD_BASE_URL',
      config.get<string>('UMAMI_DASHBOARD_BASE_URL') ?? DEFAULT_DASHBOARD_BASE_URL,
    );
    this.operationsWebsiteId = config.get<string>('UMAMI_OPERATIONS_WEBSITE_ID')?.trim() || undefined;
    this.readApiKey = config.get<string>('UMAMI_READ_API_KEY')?.trim() || undefined;
  }

  onApplicationBootstrap(): void {
    this.recordOperation('backend_started');
  }

  recordReadiness(failed: readonly Dependency[]): void {
    for (const dependency of ['database', 'redis'] as const) {
      const available = !failed.includes(dependency);
      const previous = this.readiness[dependency];
      this.readiness[dependency] = available;
      if (available === previous || (available && previous === undefined)) {
        continue;
      }
      this.recordOperation(DEPENDENCY_EVENTS[dependency][available ? 'up' : 'down']);
    }
  }

  getDashboards(): UsageDashboard[] {
    const { dashboardBase, operationsWebsiteId } = this;
    if (!dashboardBase) {
      return [];
    }

    const dashboards: [UmamiAnalyticsSource, string][] = [
      ['public', UMAMI_BROWSER_WEBSITE_IDS.public],
      ['admin', UMAMI_BROWSER_WEBSITE_IDS.admin],
    ];
    if (operationsWebsiteId) {
      dashboards.push(['operations', operationsWebsiteId]);
    }

    return dashboards.map(([source, websiteId]) => ({
      source,
      url: new URL(`websites/${encodeURIComponent(websiteId)}`, dashboardBase).href,
    }));
  }

  async getReport(): Promise<UsageReport | null> {
    const { apiBase, readApiKey, operationsWebsiteId } = this;
    if (!apiBase || !readApiKey) {
      return null;
    }

    const endAt = Date.now();
    const startAt = endAt - REPORT_WINDOW_MS;
    const readSource = async (
      source: UmamiAnalyticsSource,
      websiteId: string,
      path: string,
      names: readonly UmamiAnalyticsEvent[],
    ) => {
      const url = new URL(`websites/${encodeURIComponent(websiteId)}/metrics`, apiBase);
      url.search = new URLSearchParams({
        type: 'event',
        path,
        startAt: String(startAt),
        endAt: String(endAt),
        limit: String(names.length),
      }).toString();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${readApiKey}` },
        redirect: 'error',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error('Umami metrics request failed.');
      }
      return { source, events: this.readCounts(await response.json(), names) };
    };

    try {
      const requests = [
        readSource('public', UMAMI_BROWSER_WEBSITE_IDS.public, UMAMI_BROWSER_EVENT_PATH, UMAMI_EVENTS.public),
        readSource('admin', UMAMI_BROWSER_WEBSITE_IDS.admin, UMAMI_BROWSER_EVENT_PATH, UMAMI_EVENTS.admin),
      ];
      if (operationsWebsiteId) {
        requests.push(
          readSource('operations', operationsWebsiteId, UMAMI_OPERATIONS_EVENT_PATH, UMAMI_EVENTS.operations),
        );
      }
      return { startAt, endAt, sources: await Promise.all(requests) };
    } catch {
      throw new BadGatewayException('Could not read Umami analytics.');
    }
  }

  recordOperation(name: UmamiOperationsEvent): void {
    const { apiBase, operationsWebsiteId } = this;
    if (!apiBase || !operationsWebsiteId) {
      return;
    }

    // Every field comes from deployment configuration or the event catalog.
    void fetch(new URL('send', apiBase), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (EventManager Backend)' },
      body: JSON.stringify({
        type: 'event',
        payload: {
          website: operationsWebsiteId,
          hostname: 'eventos.cacic.com.br',
          url: UMAMI_OPERATIONS_EVENT_PATH,
          name,
        },
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
      .then(async (response) => {
        if (!response.ok) {
          this.logger.warn(`Umami rejected operational event ${name} (HTTP ${response.status}).`);
        }
        await response.body?.cancel();
      })
      .catch(() => this.logger.warn(`Could not send Umami operational event ${name}.`));
  }

  private readCounts(rows: unknown, names: readonly UmamiAnalyticsEvent[]) {
    if (!Array.isArray(rows)) {
      throw new Error('Invalid Umami metrics response.');
    }
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (
        !row ||
        (typeof row.x !== 'string' && row.x !== null) ||
        typeof row.y !== 'number' ||
        !Number.isSafeInteger(row.y) ||
        row.y < 0
      ) {
        throw new Error('Invalid Umami metric.');
      }
      if (typeof row.x === 'string') {
        counts.set(row.x, row.y);
      }
    }
    return names.map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }

  private readBaseUrl(setting: string, value: string | undefined): URL | null {
    if (!value?.trim()) {
      return null;
    }
    try {
      const url = new URL(value.trim());
      if (url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash) {
        url.pathname = `${url.pathname.replace(/\/+$/, '')}/`;
        return url;
      }
    } catch {
      // An invalid telemetry configuration should not prevent startup.
    }
    this.logger.warn(`${setting} must be an HTTPS base URL.`);
    return null;
  }
}
