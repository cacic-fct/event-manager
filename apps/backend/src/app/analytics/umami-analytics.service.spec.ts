import { jest } from '@jest/globals';
import {
  UMAMI_BROWSER_EVENT_PATH,
  UMAMI_BROWSER_WEBSITE_IDS,
  UMAMI_OPERATIONS_EVENT_PATH,
} from '@cacic-fct/shared-analytics';
import { Permission } from '@cacic-fct/shared-permissions';
import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GraphQLSchemaBuilderModule, GraphQLSchemaFactory } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { UsageReportResolver } from './usage-report.resolver';
import { UmamiAnalyticsService } from './umami-analytics.service';

const config = {
  UMAMI_API_BASE_URL: 'https://umami.example.test/api/',
  UMAMI_OPERATIONS_WEBSITE_ID: '0c0bc63b-4316-4d29-a7d4-4de8a27fae05',
  UMAMI_READ_API_KEY: 'reporting-key',
};

describe('Umami analytics', () => {
  const originalFetch = globalThis.fetch;
  const fetch = jest.fn<typeof globalThis.fetch>();

  beforeEach(() => {
    fetch.mockReset();
    globalThis.fetch = fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('sends infrastructure transitions once with a fixed server payload and no report credential', () => {
    fetch.mockResolvedValue(new Response(null, { status: 204 }));
    const analytics = new UmamiAnalyticsService(new ConfigService(config));

    analytics.onApplicationBootstrap();
    analytics.recordReadiness([]);
    analytics.recordReadiness(['redis']);
    analytics.recordReadiness(['redis']);
    analytics.recordReadiness(['redis', 'database']);
    analytics.recordReadiness([]);

    const events = [
      'backend_started',
      'redis_unavailable',
      'database_unavailable',
      'database_recovered',
      'redis_recovered',
    ];
    expect(fetch.mock.calls).toHaveLength(events.length);
    for (const [index, event] of events.entries()) {
      const [url, request] = fetch.mock.calls[index];
      expect(url.toString()).toBe('https://umami.example.test/api/send');
      expect(new Headers(request?.headers).get('Authorization')).toBeNull();
      expect(JSON.parse(String(request?.body))).toEqual({
        type: 'event',
        payload: {
          website: config.UMAMI_OPERATIONS_WEBSITE_ID,
          hostname: 'eventos.cacic.com.br',
          url: UMAMI_OPERATIONS_EVENT_PATH,
          name: event,
        },
      });
    }
  });

  it('reads aggregate metrics for the configured sources and exposes only allowlisted event names', async () => {
    fetch.mockImplementation(async () =>
      Response.json([
        { x: 'login_button_attempt', y: 3 },
        { x: 'unlisted_event', y: 12 },
      ]),
    );
    const analytics = new UmamiAnalyticsService(new ConfigService(config));

    const report = await analytics.getReport();

    expect(report).toMatchObject({
      sources: [
        {
          source: 'public',
          events: expect.arrayContaining([
            { name: 'login_button_attempt', count: 3 },
            { name: 'self_attendance_confirmed', count: 0 },
          ]),
        },
        { source: 'admin', events: expect.arrayContaining([{ name: 'login_button_attempt', count: 3 }]) },
        { source: 'operations', events: expect.arrayContaining([{ name: 'backend_started', count: 0 }]) },
      ],
    });
    expect(JSON.stringify(report)).not.toContain('unlisted_event');
    expect(JSON.stringify(report)).not.toContain(config.UMAMI_READ_API_KEY);

    const [requestUrl, request] = fetch.mock.calls[0];
    const url = new URL(requestUrl.toString());
    expect(url.pathname).toBe(`/api/websites/${UMAMI_BROWSER_WEBSITE_IDS.public}/metrics`);
    expect(url.searchParams.get('path')).toBe(UMAMI_BROWSER_EVENT_PATH);
    expect(url.searchParams.get('type')).toBe('event');
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer reporting-key');
    expect(Number(url.searchParams.get('endAt')) - Number(url.searchParams.get('startAt'))).toBe(7 * 86_400_000);
  });

  it('reports disabled and unavailable states without presenting fake zero counts', async () => {
    fetch.mockResolvedValue(new Response(null, { status: 401 }));
    const disabled = new UmamiAnalyticsService(new ConfigService());

    await expect(disabled.getReport()).resolves.toBeNull();
    expect(fetch).not.toHaveBeenCalled();

    const analytics = new UmamiAnalyticsService(new ConfigService(config));
    await expect(analytics.getReport()).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('exposes the report through the GraphQL schema', async () => {
    const module = await Test.createTestingModule({ imports: [GraphQLSchemaBuilderModule] }).compile();
    try {
      const schema = await module.get(GraphQLSchemaFactory).create([UsageReportResolver]);
      const fields = schema.getQueryType()?.getFields();
      expect(String(fields?.['usageReport']?.type)).toBe('UsageReport');
      expect(String(fields?.['usageDashboards']?.type)).toBe('[UsageDashboard!]!');
    } finally {
      await module.close();
    }
  });

  it('requires the dedicated permission for the report and the dashboard links', () => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS_KEY, UsageReportResolver)).toEqual([Permission.UsageMetrics.Read]);
  });

  it('builds private dashboard links independently of the read API key', () => {
    const analytics = new UmamiAnalyticsService(
      new ConfigService({
        UMAMI_OPERATIONS_WEBSITE_ID: config.UMAMI_OPERATIONS_WEBSITE_ID,
        UMAMI_DASHBOARD_BASE_URL: 'https://dashboard.example.test/umami',
      }),
    );

    expect(analytics.getDashboards()).toEqual([
      { source: 'public', url: `https://dashboard.example.test/umami/websites/${UMAMI_BROWSER_WEBSITE_IDS.public}` },
      { source: 'admin', url: `https://dashboard.example.test/umami/websites/${UMAMI_BROWSER_WEBSITE_IDS.admin}` },
      {
        source: 'operations',
        url: `https://dashboard.example.test/umami/websites/${config.UMAMI_OPERATIONS_WEBSITE_ID}`,
      },
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
