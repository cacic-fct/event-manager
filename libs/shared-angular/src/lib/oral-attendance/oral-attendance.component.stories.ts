import { fakerPT_BR as faker } from '@faker-js/faker';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { expect, fn, userEvent, within } from 'storybook/test';
import { OralAttendanceComponent, OralAttendanceDecision, OralAttendancePerson } from './oral-attendance.component';

type StoryArgs = {
  title: string;
  peopleCount: number;
  decidedCount: number;
  syncLabel: string;
  presentEvery: number;
  missingDocumentEvery: number;
  missingRoleEvery: number;
  longNames: boolean;
  decisionChanged: ReturnType<typeof fn>;
  manualSubmitted: ReturnType<typeof fn>;
};

function buildPeople(args: StoryArgs): OralAttendancePerson[] {
  faker.seed(20260729);
  return Array.from({ length: args.peopleCount }, (_, index) => ({
    personId: `person-${index + 1}`,
    fullName: `${faker.person.fullName()}${args.longNames ? ` ${faker.company.catchPhrase()}` : ''}`,
    identityDocument:
      args.missingDocumentEvery > 0 && (index + 1) % Math.round(args.missingDocumentEvery) === 0
        ? null
        : `•••.${faker.string.numeric(3)}.${faker.string.numeric(3)}-••`,
    unespRole:
      args.missingRoleEvery > 0 && (index + 1) % Math.round(args.missingRoleEvery) === 0
        ? null
        : faker.helpers.arrayElement(['Graduação', 'Pós-graduação', 'Docente', 'Comunidade externa']),
  }));
}

const meta: Meta<StoryArgs> = {
  title: 'CACiC Eventos/Shared/Attendance/Oral attendance',
  component: OralAttendanceComponent,
  tags: ['autodocs'],
  decorators: [applicationConfig({ providers: [provideNoopAnimations()] })],
  args: {
    title: 'Semana da Computação',
    peopleCount: 12,
    decidedCount: 3,
    syncLabel: 'Tudo sincronizado',
    presentEvery: 2,
    missingDocumentEvery: 0,
    missingRoleEvery: 0,
    longNames: false,
    decisionChanged: fn(),
    manualSubmitted: fn(),
  },
  argTypes: {
    title: { control: 'text', description: 'Nome do evento exibido durante a chamada.' },
    peopleCount: { control: { type: 'range', min: 0, max: 80, step: 1 } },
    decidedCount: { control: { type: 'range', min: 0, max: 80, step: 1 } },
    syncLabel: { control: 'text' },
    presentEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    missingDocumentEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    missingRoleEvery: { control: { type: 'range', min: 0, max: 10, step: 1 } },
    longNames: { control: 'boolean' },
    decisionChanged: { table: { disable: true } },
    manualSubmitted: { table: { disable: true } },
  },
  render: (args) => {
    const people = buildPeople(args);
    const decisions = new Map<string, OralAttendanceDecision>(
      people
        .slice(0, Math.min(args.decidedCount, people.length))
        .map((person, index) => [
          person.personId,
          args.presentEvery > 0 && (index + 1) % Math.round(args.presentEvery) === 0 ? 'PRESENT' : 'ABSENT',
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
        title: args.title,
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

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /marcar como presente/i }));
    await expect(args.decisionChanged).toHaveBeenCalled();
    await expect(canvas.queryByRole('button', { name: 'Avançar novamente' })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar para a pessoa anterior' }));
    await expect(canvas.getByRole('button', { name: 'Avançar novamente' })).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar como faltou' }));
    await expect(args.decisionChanged).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'ABSENT' }));
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

export const SemInscritos: Story = {
  args: {
    title: 'Atividade sem inscrições',
    peopleCount: 0,
    decidedCount: 0,
    syncLabel: 'Nenhuma presença para sincronizar',
  },
};

export const DarkReducedMotion: Story = {
  args: {
    title: 'Plantão noturno de credenciamento',
    peopleCount: 8,
    decidedCount: 6,
    syncLabel: '2 alterações aguardando conexão',
  },
  globals: { theme: 'dark', motion: 'reduced' },
};

export const DenseMixedRoster: Story = {
  args: {
    peopleCount: 80,
    decidedCount: 48,
    presentEvery: 3,
    missingDocumentEvery: 5,
    missingRoleEvery: 7,
    syncLabel: '12 alterações aguardando sincronização',
  },
};

export const AllPresent: Story = {
  args: { peopleCount: 20, decidedCount: 20, presentEvery: 1 },
};

export const AllAbsent: Story = {
  args: { peopleCount: 20, decidedCount: 20, presentEvery: 0 },
};

export const IncompleteIdentityData: Story = {
  args: { peopleCount: 24, decidedCount: 8, missingDocumentEvery: 2, missingRoleEvery: 3 },
};

export const LongNamesMobile: Story = {
  args: { peopleCount: 30, decidedCount: 12, longNames: true, missingDocumentEvery: 4 },
  parameters: { viewport: { defaultViewport: 'mobile' } },
  globals: { theme: 'dark', motion: 'reduced' },
};
