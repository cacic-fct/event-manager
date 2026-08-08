import type { Meta, StoryObj } from '@storybook/angular';
import { HttpResponse, http } from 'msw';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SportsBracketComponent } from './sports-bracket.component';
import { SPORTS_BRACKET_FIXTURES } from './sports-bracket.fixtures';

const meta: Meta<SportsBracketComponent> = {
  component: SportsBracketComponent,
  title: 'Shared/Sports/Visualização de chaves',
  tags: ['autodocs'],
  args: {
    matchSelected: fn(),
    ...SPORTS_BRACKET_FIXTURES.SINGLE_ELIMINATION,
  },
  argTypes: {
    format: {
      control: 'select',
      options: [
        'SINGLE_ELIMINATION',
        'ROUND_ROBIN',
        'GROUP_STAGE_ELIMINATION',
        'DOUBLE_ELIMINATION',
        'SWISS',
        'CUSTOM',
      ],
    },
    currentMatchId: { control: 'text' },
    editingMatchId: { control: 'text' },
  },
  parameters: {
    layout: 'padded',
    viewport: { defaultViewport: 'responsive' },
    msw: {
      handlers: [
        http.get('/api/storybook/sports/team-logo/:teamId', ({ params, request }) => {
          const teamId = String(params['teamId'] ?? 'team');
          const requestedColor = new URL(request.url).searchParams.get('color') ?? '';
          const color = /^#[0-9a-f]{6}$/i.test(requestedColor) ? requestedColor : '#315da8';
          const initials = teamId.replace('team-', 'T');
          return HttpResponse.text(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="39" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" font-weight="700" fill="white">${initials}</text></svg>`,
            { headers: { 'Content-Type': 'image/svg+xml' } },
          );
        }),
      ],
    },
  },
};

export default meta;
type Story = StoryObj<SportsBracketComponent>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const liveMatch = canvas.getByRole('button', {
      name: /Atlética FCT contra República Vento Norte. Ao vivo/i,
    });
    await userEvent.click(liveMatch);
    await expect(args.matchSelected).toHaveBeenCalledWith('single-r2-1');
  },
};

export const EliminacaoSimplesComFolgaENomesLongos: Story = {
  args: SPORTS_BRACKET_FIXTURES.SINGLE_ELIMINATION,
};

export const TodosContraTodos: Story = {
  args: SPORTS_BRACKET_FIXTURES.ROUND_ROBIN,
};

export const GruposEEliminatorias: Story = {
  args: SPORTS_BRACKET_FIXTURES.GROUP_STAGE_ELIMINATION,
};

export const DuplaEliminacao: Story = {
  args: SPORTS_BRACKET_FIXTURES.DOUBLE_ELIMINATION,
};

export const SistemaSuico: Story = {
  args: SPORTS_BRACKET_FIXTURES.SWISS,
};

export const FormatoPersonalizado: Story = {
  args: SPORTS_BRACKET_FIXTURES.CUSTOM,
};

export const Vazio: Story = {
  args: {
    format: 'SINGLE_ELIMINATION',
    stages: [],
    standings: [],
    currentMatchId: null,
    editingMatchId: null,
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Estrutura ainda não publicada')).toBeVisible();
  },
};
