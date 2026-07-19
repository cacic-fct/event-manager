import type { EventFormResults } from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { createAdminEventForm, createAdminEventFormResults } from '../../../testing/admin-entity-fixtures';
import { FormResultsComponent } from './form-results.component';

type ResultsMode = 'charts-and-text' | 'text-only' | 'empty' | 'invalid-summary' | 'no-results';

type WorkspaceFormResultsStoryArgs = {
  mode: ResultsMode;
  responseCount: number;
  anonymous: boolean;
  answersReleased: boolean;
  multipleChoiceBuckets: number;
  includeTextAnswers: boolean;
};

const meta: Meta<WorkspaceFormResultsStoryArgs> = {
  component: FormResultsComponent,
  title: 'CACiC Eventos/Workspace/Tabs/Forms/Workspace Form Results',
  tags: ['autodocs'],
  args: {
    mode: 'charts-and-text',
    responseCount: 42,
    anonymous: false,
    answersReleased: true,
    multipleChoiceBuckets: 5,
    includeTextAnswers: true,
  },
  argTypes: {
    mode: {
      control: 'select',
      options: ['charts-and-text', 'text-only', 'empty', 'invalid-summary', 'no-results'],
    },
    responseCount: { control: { type: 'number', min: 0, max: 300, step: 1 } },
    anonymous: { control: 'boolean' },
    answersReleased: { control: 'boolean' },
    multipleChoiceBuckets: { control: { type: 'range', min: 2, max: 9, step: 1 } },
    includeTextAnswers: { control: 'boolean' },
  },
  render: (args) => ({
    props: {
      results: args.mode === 'no-results' ? null : buildResults(args),
    },
  }),
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<WorkspaceFormResultsStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Resultados')).toBeVisible();
    await expect(await canvas.findByText(/respostas individuais/i)).toBeVisible();
  },
};

export const Anonymous: Story = {
  args: {
    anonymous: true,
    answersReleased: false,
  },
};

export const TextOnly: Story = {
  args: {
    mode: 'text-only',
    includeTextAnswers: true,
    responseCount: 12,
  },
};

export const EmptySummary: Story = {
  args: {
    mode: 'empty',
    responseCount: 0,
    includeTextAnswers: false,
  },
};

export const InvalidSummary: Story = {
  args: {
    mode: 'invalid-summary',
  },
};

function buildResults(args: WorkspaceFormResultsStoryArgs): EventFormResults {
  const summaryJson =
    args.mode === 'invalid-summary'
      ? '{invalid'
      : JSON.stringify({
          questions: buildQuestions(args),
        });

  return createAdminEventFormResults({
    form: createAdminEventForm({ name: 'Pesquisa de satisfação' }),
    responseCount: args.responseCount,
    anonymous: args.anonymous,
    answersReleased: args.answersReleased,
    summaryJson,
  });
}

function buildQuestions(args: WorkspaceFormResultsStoryArgs) {
  if (args.mode === 'empty') {
    return [];
  }

  const questions = [];
  if (args.mode !== 'text-only') {
    questions.push({
      elementId: 'rating',
      title: 'Como você avalia a atividade?',
      type: 'radio',
      answeredCount: args.responseCount,
      buckets: Array.from({ length: args.multipleChoiceBuckets }, (_, index) => ({
        label: `${index + 1} estrela${index === 0 ? '' : 's'}`,
        value: Math.max(1, args.responseCount - index * 5),
      })),
      textAnswers: [],
    });
  }

  if (args.includeTextAnswers) {
    questions.push({
      elementId: 'comments',
      title: 'O que poderíamos melhorar?',
      type: 'textarea',
      answeredCount: Math.min(args.responseCount, 6),
      buckets: [],
      textAnswers: [
        'Mais tempo para perguntas no final.',
        'O material de apoio ajudou bastante.',
        'Gostaria de receber os slides com antecedência.',
      ],
    });
  }

  return questions;
}


