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
  latencyMs: number;
  questionCount: number;
  optionCount: number;
  responseCount: number;
  requiredEvery: number;
  longLabels: boolean;
  withImages: boolean;
}

const defaultArgs: EventFormPageStoryArgs = {
  state: 'editable',
  formName: 'Avaliação da atividade',
  description: 'Conte para a organização como foi sua experiência.',
  allowResponseEdits: true,
  latencyMs: 120,
  questionCount: 2,
  optionCount: 4,
  responseCount: 12,
  requiredEvery: 2,
  longLabels: false,
  withImages: false,
};

const publicLandscapeImage = {
  id: 'public-shared-image',
  url: 'https://placehold.co/1200x675',
  width: 1200,
  height: 675,
  altText: 'Material visual de referência da atividade',
  caption: 'Consulte esta referência antes de responder.',
};

const publicPortraitImage = {
  id: 'public-portrait-image',
  url: 'https://placehold.co/900x1200',
  width: 900,
  height: 1200,
  altText: 'Cartaz vertical da atividade',
  caption: 'Cartaz completo em formato vertical.',
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
  title: 'CACiC Eventos/Forms/Event Form Page',
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
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
    questionCount: { control: { type: 'range', min: 0, max: 20, step: 1 } },
    optionCount: { control: { type: 'range', min: 1, max: 10, step: 1 } },
    responseCount: { control: { type: 'range', min: 0, max: 500, step: 1 } },
    requiredEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longLabels: { control: 'boolean' },
    withImages: { control: 'boolean' },
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
      handlers: {
        graphql: [
          http.post('/api/graphql', async ({ request }) => {
            if (activeArgs.state === 'loading') {
              await delay('infinite');
            }

            if (activeArgs.latencyMs > 0) {
              await delay(activeArgs.latencyMs);
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
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
};

export default meta;

type Story = StoryObj<EventFormPageStoryArgs>;

export const Playground: Story = {
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
  globals: { theme: 'dark', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Não foi possível carregar o formulário.')).toBeVisible();
  },
};

export const Loading: Story = {
  args: { state: 'loading', latencyMs: 0 },
};

export const DenseQuestionnaire: Story = {
  args: { questionCount: 20, optionCount: 8, requiredEvery: 2, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect((await canvas.findAllByRole('heading', { level: 3 })).length).toBe(20);
  },
};

export const NoQuestions: Story = {
  args: { questionCount: 0, latencyMs: 0 },
};

export const LongLabelsMobile: Story = {
  args: {
    questionCount: 8,
    optionCount: 6,
    longLabels: true,
    formName: 'Avaliação detalhada da experiência acadêmica, cultural e de acessibilidade da atividade',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const FormAndQuestionImages: Story = {
  args: { withImages: true, latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('img', { name: publicPortraitImage.altText })).toBeVisible();
    await expect(await canvas.findAllByRole('img', { name: publicLandscapeImage.altText })).toHaveLength(2);
    await expect(await canvas.findByText(/reutilizada na pergunta sem duplicar/i)).toBeVisible();
  },
};

export const FormAndQuestionImagesMobile: Story = {
  args: { withImages: true, latencyMs: 0, longLabels: true },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
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
        responseCount: empty ? 0 : args.responseCount,
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
                  answeredCount: args.responseCount,
                  buckets: [
                    { label: 'Excelente', value: Math.round(args.responseCount * 0.75) },
                    { label: 'Boa', value: Math.round(args.responseCount * 0.25) },
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
  faker.seed(20260724 + args.questionCount + args.optionCount);
  const questionCount = Math.max(0, Math.min(20, Math.round(args.questionCount)));
  const optionCount = Math.max(1, Math.min(10, Math.round(args.optionCount)));
  const elements = Array.from({ length: questionCount }, (_, index) => {
    const choice = index % 3 === 0;
    return {
      id: index === 0 ? 'rating' : `question-${index + 1}`,
      type: choice ? 'singleChoice' : index % 3 === 1 ? 'shortText' : 'longText',
      title:
        index === 0
          ? 'Como você avalia a atividade?'
          : args.longLabels
            ? `Conte com detalhes como a atividade contribuiu para ${faker.company.catchPhrase().toLocaleLowerCase('pt-BR')}`
            : faker.lorem.sentence({ min: 3, max: 7 }),
      required: args.requiredEvery > 0 && index % Math.round(args.requiredEvery) === 0,
      descriptionImages:
        args.withImages && index === 0
          ? [
              {
                ...publicLandscapeImage,
                caption: 'Imagem reutilizada na pergunta sem duplicar o arquivo armazenado.',
              },
            ]
          : [],
      options: choice
        ? Array.from({ length: optionCount }, (_, optionIndex) => ({
            id: index === 0 && optionIndex === 0 ? 'excellent' : `q-${index + 1}-option-${optionIndex + 1}`,
            label:
              index === 0 && optionIndex === 0
                ? 'Excelente'
                : index === 0 && optionIndex === 1
                  ? 'Boa'
                  : args.longLabels
                    ? faker.company.catchPhrase()
                    : faker.word.adjective(),
          }))
        : [],
    };
  });
  return createPublicEventForm({
    id: 'form-story',
    name: args.formName,
    description: args.description,
    descriptionImages: args.withImages ? [publicPortraitImage, publicLandscapeImage] : [],
    allowResponseEdits: args.allowResponseEdits,
    resultsPublic: resultsReleased,
    elementsJson: JSON.stringify(elements),
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
