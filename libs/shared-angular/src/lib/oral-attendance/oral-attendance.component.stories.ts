import { fakerPT_BR as faker } from '@faker-js/faker';
import { Component, computed, input, linkedSignal } from '@angular/core';
import { applicationConfig, moduleMetadata, type Meta, type StoryObj } from '@storybook/angular';
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

function buildPeople(
  args: Pick<StoryArgs, 'peopleCount' | 'longNames' | 'missingDocumentEvery' | 'missingRoleEvery'>,
): OralAttendancePerson[] {
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

function buildInitialDecisions(
  args: Pick<StoryArgs, 'decidedCount' | 'presentEvery'>,
  people: readonly OralAttendancePerson[],
): Map<string, OralAttendanceDecision> {
  return new Map(
    people
      .slice(0, Math.min(args.decidedCount, people.length))
      .map((person, index) => [
        person.personId,
        args.presentEvery > 0 && (index + 1) % Math.round(args.presentEvery) === 0 ? 'PRESENT' : 'ABSENT',
      ]),
  );
}

@Component({
  selector: 'lib-storybook-oral-attendance-host',
  imports: [OralAttendanceComponent],
  template: `
    <lib-oral-attendance
      [people]="people()"
      [decisions]="decisions()"
      [title]="title()"
      [syncLabel]="syncLabel()"
      (decisionChanged)="recordDecision($event)"
      (manualSubmitted)="manualSubmitted()($event)" />
  `,
})
class OralAttendanceStoryHostComponent {
  readonly title = input('Semana da Computação');
  readonly peopleCount = input(12);
  readonly decidedCount = input(3);
  readonly syncLabel = input('Tudo sincronizado');
  readonly presentEvery = input(2);
  readonly missingDocumentEvery = input(0);
  readonly missingRoleEvery = input(0);
  readonly longNames = input(false);
  readonly decisionChanged = input<StoryArgs['decisionChanged']>(fn());
  readonly manualSubmitted = input<StoryArgs['manualSubmitted']>(fn());

  readonly people = computed(() =>
    buildPeople({
      peopleCount: this.peopleCount(),
      longNames: this.longNames(),
      missingDocumentEvery: this.missingDocumentEvery(),
      missingRoleEvery: this.missingRoleEvery(),
    }),
  );
  private readonly initialDecisions = computed(() =>
    buildInitialDecisions({ decidedCount: this.decidedCount(), presentEvery: this.presentEvery() }, this.people()),
  );
  readonly decisions = linkedSignal(() => this.initialDecisions());

  recordDecision(event: { person: OralAttendancePerson; decision: OralAttendanceDecision }): void {
    this.decisions.update((current) => new Map(current).set(event.person.personId, event.decision));
    this.decisionChanged()(event);
  }
}

const meta: Meta<StoryArgs> = {
  title: 'Shared/Attendance/Oral Attendance',
  component: OralAttendanceStoryHostComponent,
  tags: ['autodocs'],
  decorators: [
    applicationConfig({ providers: [provideNoopAnimations()] }),
    moduleMetadata({ imports: [OralAttendanceStoryHostComponent] }),
  ],
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
    title: { control: 'text', description: 'Event name shown during attendance.' },
    peopleCount: { control: { type: 'range', min: 0, max: 80, step: 1 }, description: 'Number of generated attendees.' },
    decidedCount: { control: { type: 'range', min: 0, max: 80, step: 1 }, description: 'Number of attendees with an initial decision.' },
    syncLabel: { control: 'text', description: 'Synchronization status shown in the toolbar.' },
    presentEvery: { control: { type: 'range', min: 0, max: 10, step: 1 }, description: 'Mark every Nth initial decision as present; 0 marks everyone absent.' },
    missingDocumentEvery: { control: { type: 'range', min: 0, max: 10, step: 1 }, description: 'Omit the identity document for every Nth attendee; 0 keeps all documents.' },
    missingRoleEvery: { control: { type: 'range', min: 0, max: 10, step: 1 }, description: 'Omit the role for every Nth attendee; 0 keeps all roles.' },
    longNames: { control: 'boolean', description: 'Append a longer generated phrase to attendee names.' },
    decisionChanged: { action: 'decisionChanged', control: false, table: { disable: true } },
    manualSubmitted: { action: 'manualSubmitted', control: false, table: { disable: true } },
  },
  render: (args) => ({
    props: args,
    template: `
      <lib-storybook-oral-attendance-host
        [title]="title"
        [peopleCount]="peopleCount"
        [decidedCount]="decidedCount"
        [syncLabel]="syncLabel"
        [presentEvery]="presentEvery"
        [missingDocumentEvery]="missingDocumentEvery"
        [missingRoleEvery]="missingRoleEvery"
        [longNames]="longNames"
        [decisionChanged]="decisionChanged"
        [manualSubmitted]="manualSubmitted" />
    `,
  }),
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Controls generate a deterministic attendee roster. The story host records decisions locally so the card queue, undo/redo history, list view, and manual check-in follow the same input updates as a parent screen.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<StoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const firstPerson = canvas.getByRole('heading', { level: 2 }).textContent ?? '';
    await userEvent.click(canvas.getByRole('button', { name: /marcar como presente/i }));
    await expect(args.decisionChanged).toHaveBeenCalled();
    const nextPerson = canvas.getByRole('heading', { level: 2 });
    await expect(nextPerson).not.toHaveTextContent(firstPerson);
    await userEvent.click(canvas.getByRole('button', { name: 'Voltar para a pessoa anterior' }));
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent(firstPerson);
    await userEvent.click(canvas.getByRole('button', { name: 'Avançar novamente' }));
    await expect(canvas.getByRole('heading', { level: 2 })).toHaveTextContent(nextPerson.textContent ?? '');
    await userEvent.click(canvas.getByRole('button', { name: 'Marcar como faltou' }));
    await expect(args.decisionChanged).toHaveBeenLastCalledWith(expect.objectContaining({ decision: 'ABSENT' }));
  },
};

export const PendingChangesInList: Story = {
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

export const FinalReview: Story = {
  args: {
    peopleCount: 5,
    decidedCount: 5,
  },
};

export const EmptyRoster: Story = {
  args: {
    title: 'Atividade sem inscrições',
    peopleCount: 0,
    decidedCount: 0,
    syncLabel: 'Nenhuma presença para sincronizar',
  },
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

export const LongNames: Story = {
  args: { peopleCount: 30, decidedCount: 12, longNames: true, missingDocumentEvery: 4 },
};
