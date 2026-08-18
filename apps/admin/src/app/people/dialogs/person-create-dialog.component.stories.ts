import { MatDialogRef } from '@angular/material/dialog';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { delay, of, throwError } from 'rxjs';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PeopleApiService } from '../../graphql/people-api.service';
import { createAdminPerson } from '../../testing/admin-entity-fixtures';
import { PersonCreateDialogComponent } from './person-create-dialog.component';

interface PersonCreateDialogStoryArgs {
  name: string;
  email: string;
  identityDocument: string;
  academicId: string;
  duplicateState: 'none' | 'email' | 'document';
  saveOutcome: 'success' | 'error';
  latencyMs: number;
}

const defaultArgs: PersonCreateDialogStoryArgs = {
  name: 'Marina da Silva',
  email: 'marina@example.com',
  identityDocument: '52998224725',
  academicId: '00123456',
  duplicateState: 'none',
  saveOutcome: 'success',
  latencyMs: 120,
};

let activeArgs = defaultArgs;
const closeDialog = fn((person: Person | null) => person);

function createdPerson(): Person {
  return createAdminPerson({
    id: 'person-created-story',
    name: activeArgs.name,
    email: activeArgs.email || null,
    identityDocument: activeArgs.identityDocument || null,
    academicId: activeArgs.academicId || null,
  }) as Person;
}

const meta: Meta<PersonCreateDialogStoryArgs> = {
  component: PersonCreateDialogComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Person Create Dialog',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    name: { control: 'text' },
    email: { control: 'text' },
    identityDocument: { control: 'text' },
    academicId: { control: 'text' },
    duplicateState: { control: 'inline-radio', options: ['none', 'email', 'document'] },
    saveOutcome: { control: 'inline-radio', options: ['success', 'error'] },
    latencyMs: { control: { type: 'range', min: 0, max: 2_000, step: 100 } },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        { provide: MatDialogRef, useValue: { close: closeDialog } },
        {
          provide: PeopleApiService,
          useValue: {
            listPeopleSummaries: () => {
              const duplicate = createAdminPerson({
                id: 'person-duplicate-story',
                name: 'Marina já cadastrada',
                email: activeArgs.duplicateState === 'email' ? activeArgs.email : 'other@example.com',
                identityDocument:
                  activeArgs.duplicateState === 'document' ? activeArgs.identityDocument : '11111111111',
              });
              return of(activeArgs.duplicateState === 'none' ? [] : [duplicate]).pipe(delay(activeArgs.latencyMs));
            },
            createPerson: () =>
              activeArgs.saveOutcome === 'error'
                ? throwError(() => new Error('Não foi possível criar a pessoa de demonstração.')).pipe(
                    delay(activeArgs.latencyMs),
                  )
                : of(createdPerson()).pipe(delay(activeArgs.latencyMs)),
          },
        },
      ],
    }),
  ],
  beforeEach: () => {
    closeDialog.mockClear();
  },
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<PersonCreateDialogStoryArgs>;

async function fillForm(canvasElement: HTMLElement, args: PersonCreateDialogStoryArgs) {
  const canvas = within(canvasElement);
  if (args.name) await userEvent.type(await canvas.findByRole('textbox', { name: 'Nome' }), args.name);
  if (args.email) await userEvent.type(canvas.getByRole('textbox', { name: 'Email' }), args.email);
  if (args.identityDocument) {
    await userEvent.type(canvas.getByRole('textbox', { name: 'Documento' }), args.identityDocument);
  }
  if (args.academicId) await userEvent.type(canvas.getByRole('textbox', { name: 'Matrícula (RA)' }), args.academicId);
  return canvas;
}

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = await fillForm(canvasElement, args);
    await userEvent.click(canvas.getByRole('button', { name: 'Criar pessoa' }));
    await expect(closeDialog).toHaveBeenCalledWith(expect.objectContaining({ name: args.name, email: args.email }));
  },
};

export const DuplicateEmail: Story = {
  args: { duplicateState: 'email', latencyMs: 0 },
  play: async ({ canvasElement, args }) => {
    const canvas = await fillForm(canvasElement, args);
    await userEvent.click(canvas.getByRole('button', { name: 'Criar pessoa' }));
    await expect(await canvas.findByText(/Já existe uma pessoa/)).toBeVisible();
  },
};

export const DuplicateDocument: Story = {
  args: { duplicateState: 'document', latencyMs: 0 },
  play: async ({ canvasElement, args }) => {
    const canvas = await fillForm(canvasElement, args);
    await userEvent.click(canvas.getByRole('button', { name: 'Criar pessoa' }));
    await expect(await canvas.findByText(/Já existe uma pessoa/)).toBeVisible();
  },
};

export const SaveError: Story = {
  args: { saveOutcome: 'error', latencyMs: 0 },
  play: async ({ canvasElement, args }) => {
    const canvas = await fillForm(canvasElement, args);
    await userEvent.click(canvas.getByRole('button', { name: 'Criar pessoa' }));
    await expect(await canvas.findByText('Não foi possível criar a pessoa de demonstração.')).toBeVisible();
  },
};

export const RequiredValidation: Story = {
  args: { name: '', email: '', identityDocument: '', academicId: '', latencyMs: 0 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Criar pessoa' }));
    await expect(closeDialog).not.toHaveBeenCalled();
  },
};

export const LongContentMobile: Story = {
  args: {
    name: 'Marina Aparecida de Souza Albuquerque dos Santos e Oliveira',
    email: 'marina.aparecida.souza.albuquerque@instituicao.example.br',
    identityDocument: '52998224725123456789',
    academicId: '202612345678901234',
  },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
