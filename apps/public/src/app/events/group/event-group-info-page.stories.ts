import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { createEventPreparationStoryApi } from '@cacic-fct/shared-angular/event-preparation/testing';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import {
  createParticipationInformationFixture,
  participationInformationGraphqlData,
} from '@cacic-fct/event-manager-public-testing';
import { http, HttpResponse } from 'msw';
import { of } from 'rxjs';
import { expect, within } from 'storybook/test';
import { EventGroupInfoPage } from './event-group-info-page';

interface GroupArgs {
  subscribed: boolean;
  attended: boolean;
  lecturer: boolean;
  issuedCertificate: boolean;
  eventCount: number;
}
let current: GroupArgs = {
  subscribed: true,
  attended: false,
  lecturer: false,
  issuedCertificate: false,
  eventCount: 3,
};
const meta: Meta<GroupArgs> = {
  title: 'Public/Discovery/Unified Event Group Information',
  component: EventGroupInfoPage,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ eventGroupId: 'information-group' })),
            queryParamMap: of(convertToParamMap({})),
          },
        },
        { provide: EventPreparationApiService, useFactory: createEventPreparationStoryApi },
        {
          provide: PublicDataAccessService,
          useValue: { replaceAttendanceDetail: async () => undefined, getAttendanceDetail: async () => null },
        },
      ],
    }),
  ],
  args: current,
  argTypes: { eventCount: { control: { type: 'range', min: 1, max: 20, step: 1 } } },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    msw: {
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            const body = (await request.json()) as { query: string; variables?: Record<string, unknown> };
            const fixture = createParticipationInformationFixture({ targetType: 'event-group', ...current });
            return HttpResponse.json({
              data: participationInformationGraphqlData(body.query, body.variables ?? {}, fixture),
            });
          }),
        ],
      },
    },
  },
  render: (args) => {
    current = args;
    return { props: {} };
  },
};
export default meta;
type Story = StoryObj<GroupArgs>;
export const Subscribed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Meu certificado' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expect(canvas.queryByRole('link', { name: 'Ver opções de inscrição' })).not.toBeInTheDocument();
  },
};
export const NotSubscribed: Story = { args: { subscribed: false } };
export const AttendanceOnly: Story = { args: { subscribed: false, attended: true } };
export const CertificateOnly: Story = { args: { subscribed: false, issuedCertificate: true } };
export const LecturerOnly: Story = { args: { subscribed: false, lecturer: true } };
export const ManyActivities: Story = { args: { eventCount: 20 } };
