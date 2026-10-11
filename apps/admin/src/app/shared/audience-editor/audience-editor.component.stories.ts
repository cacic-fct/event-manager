import { EventAudience } from '@cacic-fct/shared-event-participation';
import { Permission } from '@cacic-fct/shared-permissions';
import { applicationConfig } from '@storybook/angular';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import axe from 'axe-core';
import { of } from 'rxjs';
import { AudienceEditorComponent } from './audience-editor.component';
import { PeopleApiService } from '../../graphql/people-api.service';
import { PermissionsService } from '../../permissions/permissions.service';

const meta: Meta<AudienceEditorComponent> = {
  component: AudienceEditorComponent,
  title: 'Admin/Event Management/Audiences',
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component: 'Audience editor for public, course, and invitation-based access. Use the stories to compare editable and permission-limited states.',
      },
    },
    layout: 'centered',
    a11y: { test: 'error' },
  },
  decorators: [
    applicationConfig({
      providers: [
        {
          provide: PeopleApiService,
          useValue: {
            listPeopleSummaries: () =>
              of([
                { id: 'person-1', name: 'Ana Clara Silva', email: 'ana@example.com' },
                { id: 'person-2', name: 'Bruno Santos', email: 'bruno@example.com' },
                { id: 'person-3', name: 'Carla Souza', email: 'carla@example.com' },
              ]),
          },
        },
        {
          provide: PermissionsService,
          useValue: { has: (permission: Permission) => permission === Permission.Person.Read },
        },
      ],
    }),
  ],
  argTypes: {
    audience: { control: 'select', options: Object.values(EventAudience) },
    readOnly: { control: 'boolean' },
    courseCodes: { control: 'object' },
    invitedPeople: { control: 'object' },
    parentRestrictions: { control: 'object' },
  },
  args: {
    audience: EventAudience.PUBLIC,
    courseCodes: [],
    invitedPeople: [],
    parentRestrictions: [],
    readOnly: false,
  },
};

export default meta;

type Story = StoryObj<AudienceEditorComponent>;

const publicStory: Story = {
  play: async ({ canvasElement }) => {
    await expectNoAxeViolations(canvasElement);
  },
};

export const Playground: Story = publicStory;


export const CourseOnly: Story = {
  args: {
    audience: EventAudience.COURSE_ONLY,
    courseCodes: ['12'],
  },
  play: async ({ canvasElement }) => {
    await expectNoAxeViolations(canvasElement);
  },
};

export const InvitationOnly: Story = {
  args: {
    audience: EventAudience.INVITATION_ONLY,
    invitedPeople: [{ id: 'person-2', name: 'Bruno Santos', email: 'bruno@example.com' }],
  },
  play: async ({ canvasElement, step }) => {
    const canvas = within(canvasElement);
    const search = canvas.getByRole('searchbox', { name: 'Buscar pessoa para convidar' });
    await userEvent.type(search, 'Carla');
    await userEvent.click(canvas.getByRole('button', { name: 'Buscar' }));
    await expect(canvas.getByText('Carla Souza')).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Convidar Carla Souza' }));
    await expect(canvas.getByRole('button', { name: 'Remover convite para Carla Souza' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Remover convite para Carla Souza' }));
    await expect(canvas.queryByRole('button', { name: 'Remover convite para Carla Souza' })).toBeNull();
    await step('Executa a verificação de acessibilidade com axe', async () => {
      await expectNoAxeViolations(canvasElement);
    });
  },
};

export const ReadOnlyInvitation: Story = {
  args: {
    audience: EventAudience.INVITATION_ONLY,
    invitedPeople: [{ id: 'person-1', name: 'Ana Clara Silva', email: 'ana@example.com' }],
    parentRestrictions: [{ label: 'Grande evento “Semana da Computação”', audience: EventAudience.UNESP_ONLY }],
    readOnly: true,
  },
  play: async ({ canvasElement }) => {
    await expectNoAxeViolations(canvasElement);
  },
};

export const InvitationOnlyMissingPersonPermission: Story = {
  args: {
    audience: EventAudience.INVITATION_ONLY,
  },
  decorators: [
    applicationConfig({
      providers: [{ provide: PermissionsService, useValue: { has: () => false } }],
    }),
  ],
  play: async ({ canvasElement }) => {
    await expectNoAxeViolations(canvasElement);
  },
};

async function expectNoAxeViolations(canvasElement: HTMLElement): Promise<void> {
  try {
    const result = await axe.run(canvasElement);
    canvasElement.dataset['audienceAxeComplete'] = 'true';
    canvasElement.dataset['audienceAxeViolations'] = String(result.violations.length);
    canvasElement.dataset['audienceAxeDetails'] = JSON.stringify(result.violations.map((violation) => ({
      id: violation.id,
      nodes: violation.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })),
    })));
    expect(result.violations).toEqual([]);
  } catch (error) {
    canvasElement.dataset['audienceAxeError'] = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
