import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { EventPreparationApiService } from '@cacic-fct/shared-angular/event-preparation';
import { createEventPreparationStoryApi } from '@cacic-fct/shared-angular/event-preparation/testing';
import { PublicDataAccessService } from '@cacic-fct/public-indexed-db';
import {
  createParticipationInformationFixture,
  participationInformationGraphqlData,
} from '@cacic-fct/event-manager-public-testing';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { delay, http, HttpResponse } from 'msw';
import { of } from 'rxjs';
import { expect, userEvent, within } from 'storybook/test';
import { MajorEventInfoPage } from './major-event-info-page';

interface UnifiedInfoArgs {
  subscribed: boolean;
  attended: boolean;
  lecturer: boolean;
  issuedCertificate: boolean;
  subscriptionStatus: string;
  eventCount: number;
  state: 'ready' | 'loading' | 'program-error';
}

const context: { args: UnifiedInfoArgs } = {
  args: {
    subscribed: true,
    attended: false,
    lecturer: false,
    issuedCertificate: false,
    subscriptionStatus: 'CONFIRMED',
    eventCount: 3,
    state: 'ready',
  },
};

const meta: Meta<UnifiedInfoArgs> = {
  title: 'Public/Discovery/Unified Major Event Information',
  component: MajorEventInfoPage,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ majorEventId: 'information-major' })),
            queryParamMap: of(convertToParamMap({ returnUrl: '/profile/attendances' })),
          },
        },
        { provide: EventPreparationApiService, useFactory: createEventPreparationStoryApi },
        {
          provide: PublicDataAccessService,
          useValue: {
            replaceAttendanceDetail: async () => undefined,
            getAttendanceDetail: async () => null,
          },
        },
      ],
    }),
  ],
  args: context.args,
  argTypes: {
    subscriptionStatus: {
      control: 'select',
      options: ['CONFIRMED', 'WAITING_RECEIPT_UPLOAD', 'RECEIPT_UNDER_REVIEW', 'REJECTED_INVALID_RECEIPT', 'CANCELED'],
    },
    eventCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    state: { control: 'radio', options: ['ready', 'loading', 'program-error'] },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'error' },
    docs: {
      description: {
        component: 'Dados ilustrativos. Visão unificada com programação pública e ferramentas da participação.',
      },
    },
    msw: {
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            const body = (await request.json()) as { query: string; variables?: Record<string, unknown> };
            if (context.args.state === 'loading') await delay('infinite');
            if (context.args.state === 'program-error' && body.query.includes('publicEvents(')) {
              return HttpResponse.json({ errors: [{ message: 'Programação temporariamente indisponível.' }] });
            }
            const fixture = createParticipationInformationFixture({ targetType: 'major-event', ...context.args });
            faker.seed(42);
            fixture.majorEvent.description = `Troque experiências com a comunidade acadêmica.\n\nConheça atividades sobre ${faker.helpers.arrayElements(['ciência aberta', 'tecnologia acessível', 'projetos de extensão'], 2).join(' e ')}. Consulte a programação e escolha os encontros de seu interesse.`;
            return HttpResponse.json({
              data: participationInformationGraphqlData(body.query, body.variables ?? {}, fixture),
            });
          }),
        ],
      },
    },
  },
  render: (args) => {
    context.args = args;
    return { props: {} };
  },
};
export default meta;
type Story = StoryObj<UnifiedInfoArgs>;

export const Subscribed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Meu certificado' })).toBeVisible();
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const subscription = canvas.getByRole('tab', { name: /^(Minha inscrição|Inscrição)$/ });
    await expect(subscription).toHaveAttribute('aria-selected', 'true');
    await expect(canvas.queryByRole('heading', { name: 'Programação' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('tab', { name: /^(Sobre o evento|Sobre)$/ }));
    await expect(await canvas.findByRole('heading', { name: 'Programação' })).toBeVisible();
    await userEvent.click(subscription);
  },
};
export const NotSubscribed: Story = {
  args: { subscribed: false },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Programação' })).toBeVisible();
    await expect(canvas.queryByRole('tablist')).not.toBeInTheDocument();
  },
};
export const AttendanceOnly: Story = { args: { subscribed: false, attended: true } };
export const CertificateOnly: Story = { args: { subscribed: false, issuedCertificate: true } };
export const LecturerOnly: Story = { args: { subscribed: false, lecturer: true } };
export const AwaitingReceipt: Story = { args: { subscriptionStatus: 'WAITING_RECEIPT_UPLOAD' } };
export const ReceiptInReview: Story = { args: { subscriptionStatus: 'RECEIPT_UNDER_REVIEW' } };
export const ReceiptRejected: Story = { args: { subscriptionStatus: 'REJECTED_INVALID_RECEIPT' } };
export const Canceled: Story = { args: { subscriptionStatus: 'CANCELED' } };
export const EmptyProgram: Story = { args: { eventCount: 0 } };
export const ManyActivities: Story = { args: { eventCount: 20, attended: true } };
export const ProgramError: Story = { args: { state: 'program-error' } };
export const Loading: Story = { args: { state: 'loading' } };
