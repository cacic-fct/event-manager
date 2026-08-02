import { fakerPT_BR as faker } from '@faker-js/faker';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { expect, fn, userEvent, within } from 'storybook/test';
import {
  OralAttendanceComponent,
  OralAttendanceDecision,
  OralAttendancePerson,
} from './oral-attendance.component';

type StoryArgs = {
  peopleCount: number;
  decidedCount: number;
  syncLabel: string;
  decisionChanged: ReturnType<typeof fn>;
  manualSubmitted: ReturnType<typeof fn>;
};

function buildPeople(count: number): OralAttendancePerson[] {
  faker.seed(20260729);
  return Array.from({ length: count }, (_, index) => ({
    personId: `person-${index + 1}`,
    fullName: faker.person.fullName(),
    identityDocument: `•••.${faker.string.numeric(3)}.${faker.string.numeric(3)}-••`,
    unespRole: faker.helpers.arrayElement(['Graduação', 'Pós-graduação', 'Docente', 'Comunidade externa']),
  }));
}

const meta: Meta<StoryArgs> = {
  title: 'Shared/Attendance/Chamada oral',
  component: OralAttendanceComponent,
  decorators: [applicationConfig({ providers: [provideNoopAnimations()] })],
  args: {
    peopleCount: 12,
    decidedCount: 3,
    syncLabel: 'Tudo sincronizado',
    decisionChanged: fn(),
    manualSubmitted: fn(),
  },
  argTypes: {
    peopleCount: { control: { type: 'range', min: 1, max: 80, step: 1 } },
    decidedCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
    syncLabel: { control: 'text' },
  },
  render: (args) => {
    const people = buildPeople(args.peopleCount);
    const decisions = new Map<string, OralAttendanceDecision>(
      people.slice(0, Math.min(args.decidedCount, people.length)).map((person, index) => [
        person.personId,
        index % 4 === 0 ? 'ABSENT' : 'PRESENT',
      ]),
    );
    return {
      template: `
        <lib-oral-attendance
          [people]="people"
          [decisions]="decisions"
          [title]="title"
          [syncLabel]="syncLabel"
          (decisionChanged)="decisionChanged($event)"
          (manualSubmitted)="manualSubmitted($event)" />
      `,
      props: {
        people,
        decisions,
        title: 'Semana da Computação',
        syncLabel: args.syncLabel,
        decisionChanged: args.decisionChanged,
        manualSubmitted: args.manualSubmitted,
      },
    };
  },
  parameters: {
    layout: 'fullscreen',
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Cartoes: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /marcar como presente/i }));
    await expect(args.decisionChanged).toHaveBeenCalled();
    await expect(canvas.queryByRole('button', { name: 'Avançar novamente' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar para a pessoa anterior' }));
    await expect(canvas.getByRole('button', { name: 'Avançar novamente' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar como faltou' }));
    await expect(args.decisionChanged).toHaveBeenLastCalledWith(
      expect.objectContaining({ decision: 'ABSENT' }),
    );
  },
};

export const ListaComPendencias: Story = {
  args: {
    peopleCount: 24,
    decidedCount: 8,
    syncLabel: '4 alterações salvas off-line',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('radio', { name: 'Exibir lista' }));
    await expect(canvas.getByRole('list', { name: 'Pessoas inscritas' })).toBeVisible();
  },
};

export const RevisaoFinal: Story = {
  args: {
    peopleCount: 5,
    decidedCount: 5,
  },
};
