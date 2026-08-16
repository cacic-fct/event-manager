import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import { PersonSearchComponent } from './person-search.component';

const people = [
  {
    id: 'person-ada',
    name: 'Ada Lovelace de Souza',
    email: 'ada.souza@example.com',
    identityDocument: '123.456.789-00',
    academicId: '20260001',
  },
  {
    id: 'person-grace',
    name: 'Grace Oliveira Hopper',
    email: 'grace.hopper@example.com',
    identityDocument: null,
    academicId: '20260002',
  },
] as Person[];

const meta: Meta<PersonSearchComponent> = {
  component: PersonSearchComponent,
  title: 'CACiC Eventos/Workspace/Components/Person Search',
  tags: ['autodocs'],
  args: {
    label: 'Buscar pessoa para vincular',
    query: 'Ada',
    results: people,
    loading: false,
    disabled: false,
    resultActionLabel: 'Selecionar',
  },
  parameters: {
    layout: 'centered',
  },
};

export default meta;

type Story = StoryObj<PersonSearchComponent>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('searchbox', { name: /buscar pessoa para vincular/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Grace');
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
    await expect(canvas.getByRole('button', { name: /selecionar ada/i })).toBeVisible();
  },
};

export const Loading: Story = {
  args: {
    loading: true,
    results: [],
  },
};

export const PermissionRequired: Story = {
  args: {
    disabled: true,
    results: [],
    disabledReason: 'Buscar pessoas exige permissão de Pessoa · Visualizar.',
  },
};

export const DarkMobile: Story = {
  globals: { theme: 'dark' },
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
};
