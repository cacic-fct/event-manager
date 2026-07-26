import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { createPublicEventForm, createPublicEventFormLink } from '@cacic-fct/event-manager-public-testing';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { applicationConfig } from '@storybook/angular';
import { HttpResponse, delay, http } from 'msw';
import { of } from 'rxjs';
import { expect, within } from 'storybook/test';
import { EventFormPage } from './event-form-page';

faker.seed(20260724);

type EventFormPageStoryState = 'editable' | 'submitted' | 'closed' | 'results' | 'empty-results' | 'error' | 'loading';

interface EventFormPageStoryArgs {
  state: EventFormPageStoryState;
  formName: string;
  description: string;
  allowResponseEdits: boolean;
}

const defaultArgs: EventFormPageStoryArgs = {
  state: 'editable',
  formName: 'Avaliação da atividade',
  description: 'Conte para a organização como foi sua experiência.',
  allowResponseEdits: true,
};

let activeArgs = defaultArgs;

const route = {
  paramMap: of(convertToParamMap({ formId: 'form-story' })),
  queryParamMap: of(convertToParamMap({ targetType: 'EVENT', targetId: 'event-story', linkId: 'link-story' })),
  snapshot: {
    paramMap: convertToParamMap({ formId: 'form-story' }),
    queryParamMap: convertToParamMap({
      targetType: 'EVENT',
      targetId: 'event-story',
      linkId: 'link-story',
    }),
  },
};

const meta: Meta<EventFormPageStoryArgs> = {
  component: EventFormPage,
  title: 'Public/Forms/Event Form Page',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    state: {
      control: 'select',
      options: ['editable', 'submitted', 'closed', 'results', 'empty-results', 'error', 'loading'],
      description: 'Estado de dados e disponibilidade retornado pela API.',
    },
    formName: { control: 'text' },
    description: { control: 'text' },
    allowResponseEdits: { control: 'boolean' },
  },
  decorators: [
    applicationConfig({
      providers: [{ provide: ActivatedRoute, useValue: route }],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Página de resposta de formulários vinculados a inscrições, com carregamento, indisponibilidade, resposta existente, resultados agregados e falha de API.',
      },
    },
    msw: {
      handlers: [
        http.post('/api/graphql', async ({ request }) => {
          if (activeArgs.state === 'loading') {
            await delay('infinite');
          }

          const body = (await request.json()) as { query?: string };
          const query = body.query ?? '';
          if (activeArgs.state === 'error' && query.includes('CurrentUserEventForms')) {
            return HttpResponse.json({ errors: [{ message: 'Não foi possível carregar o formulário.' }] });
          }

          return HttpResponse.json({ data: graphqlData(query, activeArgs) });
        }),
      ],
    },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
};

export default meta;

type Story = StoryObj<EventFormPageStoryArgs>;

export const Editable: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: defaultArgs.formName })).toBeVisible();
    await expect(await canvas.findByRole('button', { name: 'Salvar respostas' })).toBeVisible();
  },
};

export const ExistingResponse: Story = {
  args: { state: 'submitted', allowResponseEdits: false },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Suas respostas já foram enviadas.')).toBeVisible();
  },
};

export const Closed: Story = {
  args: { state: 'closed' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Este formulário está encerrado.')).toBeVisible();
  },
};

export const ReleasedResults: Story = {
  args: { state: 'results' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Resultados' })).toBeVisible();
    await expect(await canvas.findByText('Excelente')).toBeVisible();
  },
};

export const ReleasedWithoutAnswers: Story = {
  args: { state: 'empty-results' },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText('Ainda não há perguntas respondidas neste formulário.'),
    ).toBeVisible();
  },
};

export const ApiError: Story = {
  args: { state: 'error' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar o formulário.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading' },
};

function graphqlData(query: string, args: EventFormPageStoryArgs): Record<string, unknown> {
  const form = storyForm(args);
  if (query.includes('CurrentUserEventForms')) {
    return { currentUserEventForms: [form] };
  }
  if (query.includes('CurrentUserEventFormResponse')) {
    return {
      currentUserEventFormResponse:
        args.state === 'submitted'
          ? {
              id: 'response-story',
              formId: form.id,
              linkId: 'link-story',
              targetType: 'EVENT',
              eventId: 'event-story',
              majorEventId: null,
              personId: 'person-story',
              respondentName: faker.person.fullName(),
              respondentEmail: faker.internet.email(),
              answersJson: JSON.stringify([{ elementId: 'rating', value: 'excellent' }]),
              source: 'PUBLIC',
              submittedAt: '2026-07-23T18:00:00.000Z',
              updatedAt: '2026-07-23T18:00:00.000Z',
            }
          : null,
    };
  }
  if (query.includes('CurrentUserEventFormResults')) {
    const empty = args.state === 'empty-results';
    return {
      currentUserEventFormResults: {
        responseCount: empty ? 0 : 12,
        anonymous: true,
        answersReleased: true,
        summaryJson: JSON.stringify({
          questions: empty
            ? []
            : [
                {
                  elementId: 'rating',
                  title: 'Como você avalia a atividade?',
                  type: 'singleChoice',
                  answeredCount: 12,
                  buckets: [
                    { label: 'Excelente', value: 9 },
                    { label: 'Boa', value: 3 },
                  ],
                  textAnswers: [],
                },
              ],
        }),
        form,
        responses: [],
      },
    };
  }
  if (query.includes('SubmitCurrentUserEventFormResponse')) {
    return { submitCurrentUserEventFormResponse: null };
  }
  return {};
}

function storyForm(args: EventFormPageStoryArgs) {
  const resultsReleased = args.state === 'results' || args.state === 'empty-results';
  return createPublicEventForm({
    id: 'form-story',
    name: args.formName,
    description: args.description,
    allowResponseEdits: args.allowResponseEdits,
    resultsPublic: resultsReleased,
    elementsJson: JSON.stringify([
      {
        id: 'rating',
        type: 'singleChoice',
        title: 'Como você avalia a atividade?',
        required: true,
        options: [
          { id: 'excellent', label: 'Excelente' },
          { id: 'good', label: 'Boa' },
        ],
      },
      {
        id: 'comments',
        type: 'longText',
        title: 'Comentários',
        required: false,
        options: [],
      },
    ]),
    links: [
      createPublicEventFormLink({
        id: 'link-story',
        formId: 'form-story',
        eventId: 'event-story',
        availableUntil: args.state === 'closed' ? '2020-01-01T00:00:00.000Z' : null,
      }),
    ],
  });
}
