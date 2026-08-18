import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PersonSearchComponent } from './person-search.component';

interface PersonSearchStoryArgs {
  disabled: boolean;
  disabledReason: string;
  label: string;
  loading: boolean;
  minimumQueryLength: number;
  personSelected: ReturnType<typeof fn>;
  query: string;
  queryChange: ReturnType<typeof fn>;
  resultActionIcon: string;
  resultActionLabel: string;
  resultCount: number;
  searchRequested: ReturnType<typeof fn>;
  showAcademicId: boolean;
  showEmail: boolean;
  showIdentityDocument: boolean;
}

const defaultArgs: PersonSearchStoryArgs = {
  disabled: false,
  disabledReason: 'Buscar pessoas exige permissão de Pessoa · Visualizar.',
  label: 'Buscar pessoa para vincular',
  loading: false,
  minimumQueryLength: 2,
  personSelected: fn(),
  query: 'Ada',
  queryChange: fn(),
  resultActionIcon: 'person_add',
  resultActionLabel: 'Selecionar',
  resultCount: 4,
  searchRequested: fn(),
  showAcademicId: true,
  showEmail: true,
  showIdentityDocument: true,
};

const meta: Meta<PersonSearchStoryArgs> = {
  component: PersonSearchComponent,
  title: 'CACiC Eventos/Workspace/Components/Person Search',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    resultCount: { control: { type: 'range', min: 0, max: 40, step: 1 } },
    label: { control: 'text' },
    query: { control: 'text' },
    loading: { control: 'boolean' },
    disabled: { control: 'boolean' },
    disabledReason: { control: 'text', if: { arg: 'disabled', eq: true } },
    minimumQueryLength: { control: { type: 'range', min: 1, max: 10, step: 1 } },
    resultActionLabel: { control: 'text' },
    resultActionIcon: { control: 'text' },
    showEmail: { control: 'boolean' },
    showIdentityDocument: { control: 'boolean' },
    showAcademicId: { control: 'boolean' },
    queryChange: { control: false },
    searchRequested: { control: false },
    personSelected: { control: false },
  },
  render: (args) => ({ props: { ...args, results: createPeople(args) } }),
  parameters: { layout: 'centered', a11y: { test: 'error' } },
};

export default meta;
type Story = StoryObj<PersonSearchStoryArgs>;

export const Playground: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('searchbox', { name: /buscar pessoa para vincular/i });
    await userEvent.clear(input);
    await userEvent.type(input, 'Grace');
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
    await expect(args.queryChange).toHaveBeenLastCalledWith('Grace');
    await expect(args.searchRequested).toHaveBeenCalledWith('Grace');
    const firstResult = canvas.getAllByRole('button', { name: /selecionar/i })[0];
    if (!firstResult) throw new Error('Expected at least one person search result.');
    await expect(firstResult).toBeVisible();
    await userEvent.click(firstResult);
    await expect(args.personSelected).toHaveBeenCalledTimes(1);
  },
};

export const Loading: Story = { args: { loading: true, resultCount: 0 } };

export const Empty: Story = { args: { query: 'Pessoa inexistente', resultCount: 0 } };

export const MissingOptionalData: Story = {
  name: 'Sem e-mail ou documentos',
  args: { showAcademicId: false, showEmail: false, showIdentityDocument: false },
};

export const DenseResults: Story = { name: 'Muitos resultados', args: { resultCount: 40 } };

export const PermissionRequired: Story = {
  args: {
    disabled: true,
    resultCount: 0,
    disabledReason: 'Buscar pessoas exige permissão de Pessoa · Visualizar.',
  },
};

export const LongContentOnMobile: Story = {
  name: 'Conteúdo extenso no celular',
  args: {
    label: 'Buscar pessoa responsável pela organização e pelo acompanhamento desta atividade',
    resultActionLabel: 'Vincular como pessoa responsável',
    resultCount: 8,
  },
  globals: { theme: 'dark', motion: 'reduced' },
  parameters: { viewport: { defaultViewport: 'mobile' } },
};

function createPeople(args: PersonSearchStoryArgs): Person[] {
  faker.seed(20260816 + args.resultCount);
  return Array.from({ length: args.resultCount }, (_, index) => ({
    id: `person-${index + 1}`,
    name: index === 0 ? 'Ada Lovelace de Souza' : faker.person.fullName(),
    email: args.showEmail ? faker.internet.email().toLocaleLowerCase('pt-BR') : null,
    identityDocument: args.showIdentityDocument
      ? faker.helpers.fromRegExp(/[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}/)
      : null,
    academicId: args.showAcademicId ? String(20260001 + index) : null,
  })) as Person[];
}
