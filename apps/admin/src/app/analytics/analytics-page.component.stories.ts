import { registerLocaleData } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import localePt from '@angular/common/locales/pt';
import { LOCALE_ID } from '@angular/core';
import type { UsageDashboard, UsageReport } from '@cacic-fct/shared-analytics';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { graphql, HttpResponse } from 'msw';
import { expect, within } from 'storybook/test';
import { AnalyticsPageComponent } from './analytics-page.component';

registerLocaleData(localePt);

const endAt = Date.now();
const report: UsageReport = {
  startAt: endAt - 7 * 86_400_000,
  endAt,
  sources: [
    {
      source: 'public',
      events: [
        { name: 'login_button_attempt', count: 92 },
        { name: 'event_detail_viewed', count: 280 },
        { name: 'event_share_link_copied', count: 36 },
        { name: 'self_attendance_confirmed', count: 55 },
        { name: 'ticket_receipt_submitted', count: 24 },
      ],
    },
    {
      source: 'admin',
      events: [
        { name: 'login_button_attempt', count: 23 },
        { name: 'ticket_sale_approved', count: 17 },
      ],
    },
    {
      source: 'operations',
      events: [
        { name: 'backend_started', count: 2 },
        { name: 'redis_unavailable', count: 1 },
        { name: 'redis_recovered', count: 1 },
      ],
    },
  ],
};

const meta = {
  title: 'Admin/Métricas de uso',
  component: AnalyticsPageComponent,
  decorators: [applicationConfig({ providers: [provideHttpClient(), { provide: LOCALE_ID, useValue: 'pt-BR' }] })],
} satisfies Meta<AnalyticsPageComponent>;

export default meta;
type Story = StoryObj<typeof meta>;

const api = graphql.link('/api/graphql');
const dashboards: UsageDashboard[] = [
  { source: 'public', url: 'https://umami.example.test/websites/public-site' },
  { source: 'admin', url: 'https://umami.example.test/websites/admin-site' },
  { source: 'operations', url: 'https://umami.example.test/websites/operations-site' },
];
const dashboardHandler = api.query('UsageDashboards', () =>
  HttpResponse.json({ data: { usageDashboards: dashboards } }),
);

export const Report: Story = {
  parameters: {
    msw: {
      handlers: [
        dashboardHandler,
        api.query('UsageReport', () => HttpResponse.json({ data: { usageReport: report } })),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const operations = await canvas.findByRole('table', { name: 'Infraestrutura' });
    await expect(within(operations).getByRole('rowheader', { name: 'Inicializações do servidor' })).toBeVisible();
    const link = await canvas.findByRole('link', { name: 'Infraestrutura no Umami' });
    await expect(link).toHaveAttribute('href', dashboards[2].url);
  },
};

export const NotConfigured: Story = {
  parameters: {
    msw: {
      handlers: [dashboardHandler, api.query('UsageReport', () => HttpResponse.json({ data: { usageReport: null } }))],
    },
  },
};

export const Unavailable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Não foi possível consultar o Umami.');
    await expect(await canvas.findByRole('link', { name: 'Site público no Umami' })).toBeVisible();
  },
  parameters: {
    msw: {
      handlers: [
        dashboardHandler,
        api.query('UsageReport', () => HttpResponse.json({ errors: [{ message: 'Umami indisponível' }] })),
      ],
    },
  },
};
