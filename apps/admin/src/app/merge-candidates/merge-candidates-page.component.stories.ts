import { FormBuilder } from '@angular/forms';
import { inject, signal } from '@angular/core';
import type { MergeCandidate, MergeCandidateStatus, MergeMatchMethod } from '@cacic-fct/event-manager-admin-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { withScenarioControls } from '@cacic-fct/shared-angular/storybook';
import { expect, fn, userEvent, within } from 'storybook/test';
import { PermissionsService } from '../permissions/permissions.service';
import { createAdminPerson } from '../testing/admin-entity-fixtures';
import { MergeCandidatesPageComponent } from './merge-candidates-page.component';
import { MergeCandidatesService } from './merge-candidates.service';

type CandidateStatusScenario = MergeCandidateStatus | 'MIXED';

interface MergeCandidatesPageStoryArgs {
  candidateCount: number;
  statusScenario: CandidateStatusScenario;
  matchMethod: MergeMatchMethod;
  scoreStart: number;
  scoreStep: number;
  longNames: boolean;
  canMutate: boolean;
}

const defaultArgs: MergeCandidatesPageStoryArgs = {
  candidateCount: 12,
  statusScenario: 'PENDING',
  matchMethod: 'EMAIL',
  scoreStart: 0.98,
  scoreStep: 0.03,
  longNames: false,
  canMutate: true,
};

let activeArgs = defaultArgs;
const scanCandidates = fn(() => Promise.resolve());
const applyFilters = fn(() => Promise.resolve());
const mergeCandidate = fn((candidate: MergeCandidate) => Promise.resolve(candidate.id));
const updateCandidate = fn((candidate: MergeCandidate, status: MergeCandidateStatus) =>
  Promise.resolve(`${candidate.id}:${status}`),
);
const deleteCandidate = fn((candidate: MergeCandidate) => Promise.resolve(candidate.id));
const undoCandidate = fn((candidate: MergeCandidate) => Promise.resolve(candidate.id));

function statusAt(index: number, scenario: CandidateStatusScenario): MergeCandidateStatus {
  if (scenario !== 'MIXED') return scenario;
  return (['PENDING', 'MERGED', 'REJECTED', 'STALE'] as const)[index % 4];
}

function buildCandidates(args: MergeCandidatesPageStoryArgs): MergeCandidate[] {
  faker.seed(20260816 + args.candidateCount);
  return Array.from({ length: Math.max(0, Math.min(100, Math.round(args.candidateCount))) }, (_, index) => {
    const suffix = args.longNames ? ` ${faker.company.catchPhrase()} ${faker.company.buzzPhrase()}` : '';
    const personA = createAdminPerson({
      id: `candidate-${index + 1}-a`,
      name: `${faker.person.fullName()}${suffix}`,
      email: faker.internet.email().toLocaleLowerCase('pt-BR'),
    });
    const personB = createAdminPerson({
      id: `candidate-${index + 1}-b`,
      name: `${faker.person.fullName()}${suffix}`,
      email: index % 2 === 0 ? personA.email : faker.internet.email().toLocaleLowerCase('pt-BR'),
    });
    return {
      id: `merge-candidate-${index + 1}`,
      personAId: personA.id,
      personBId: personB.id,
      pairKey: `${personA.id}:${personB.id}`,
      score: Math.max(0, Number((args.scoreStart - index * args.scoreStep).toFixed(2))),
      matchMethod: args.matchMethod,
      matchValue: args.matchMethod === 'EMAIL' ? personA.email : personA.name,
      status: statusAt(index, args.statusScenario),
      resolvedById: null,
      createdAt: new Date(Date.now() - index * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - index * 3_600_000).toISOString(),
      personA,
      personB,
    } as MergeCandidate;
  });
}

function createMergeCandidatesStoryService() {
  const formBuilder = inject(FormBuilder);
  const candidates = buildCandidates(activeArgs);
  const visibleCount = Math.min(50, candidates.length);
  const mergeCandidates = signal(candidates.slice(0, visibleCount));
  const mergeCandidateCount = signal(candidates.length);
  const pageLabel = signal(candidates.length === 0 ? '0 de 0' : `1-${visibleCount} de ${candidates.length}`);
  const hasNextPage = signal(candidates.length > visibleCount);
  const mergeFilterForm = formBuilder.nonNullable.group({
    status: [activeArgs.statusScenario === 'MIXED' ? 'PENDING' : activeArgs.statusScenario],
    query: [''],
  });

  const applyMergeCandidateFilters = async () => {
    applyFilters();
    const query = mergeFilterForm.controls.query.value.trim().toLocaleLowerCase('pt-BR');
    const status = mergeFilterForm.controls.status.value;
    const filtered = candidates.filter((candidate) => {
      const personText = [
        candidate.personA?.name,
        candidate.personA?.email,
        candidate.personB?.name,
        candidate.personB?.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return candidate.status === status && (!query || personText.includes(query));
    });
    const page = filtered.slice(0, 50);
    mergeCandidates.set(page);
    mergeCandidateCount.set(filtered.length);
    pageLabel.set(filtered.length === 0 ? '0 de 0' : `1-${page.length} de ${filtered.length}`);
    hasNextPage.set(filtered.length > page.length);
  };

  return {
    mergeCandidates,
    mergeCandidateCount,
    mergeFilterForm,
    mergeCandidatesPagination: {
      label: pageLabel,
      hasPreviousPage: signal(false),
      hasNextPage,
    },
    applyMergeCandidateFilters,
    scanMergeCandidates: scanCandidates,
    mergeCandidate,
    setMergeCandidateStatus: updateCandidate,
    deleteMergeCandidate: deleteCandidate,
    undoMergeCandidate: undoCandidate,
    previousMergeCandidatesPage: fn(() => Promise.resolve()),
    nextMergeCandidatesPage: fn(() => Promise.resolve()),
  };
}

const meta: Meta<MergeCandidatesPageStoryArgs> = {
  component: MergeCandidatesPageComponent,
  title: 'Admin/People/Merge Candidates/Queue',
  tags: ['autodocs'],
  args: defaultArgs,
  argTypes: {
    candidateCount: { control: { type: 'range', min: 0, max: 100, step: 1 } },
    statusScenario: { control: 'select', options: ['PENDING', 'MERGED', 'REJECTED', 'STALE', 'MIXED'] },
    matchMethod: { control: 'select', options: ['CPF', 'EMAIL', 'NORMALIZED_NAME'] },
    scoreStart: { control: { type: 'range', min: 0, max: 1, step: 0.01 } },
    scoreStep: { control: { type: 'range', min: 0, max: 0.2, step: 0.01 } },
    longNames: { control: 'boolean' },
    canMutate: { control: 'boolean' },
  },
  render: (args) => {
    activeArgs = { ...defaultArgs, ...args };
    return { props: {} };
  },
  decorators: [
    withScenarioControls<MergeCandidatesPageStoryArgs>(),
    applicationConfig({
      providers: [
        { provide: MergeCandidatesService, useFactory: createMergeCandidatesStoryService },
        {
          provide: PermissionsService,
          useValue: {
            canEdit: () => activeArgs.canMutate,
            canDelete: () => activeArgs.canMutate,
          },
        },
      ],
    }),
  ],
  beforeEach: () => {
    scanCandidates.mockClear();
    applyFilters.mockClear();
  },
  parameters: {
    docs: {
      description: {
        component: 'Duplicate person review queue with controls for match method, candidate status, density, and editing permissions.',
      },
    },
    layout: 'fullscreen',
    a11y: { test: 'error' },
  },
};

export default meta;
type Story = StoryObj<MergeCandidatesPageStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.findByRole('textbox', { name: 'Buscar pessoa' })).resolves.toBeVisible();
    await expect(canvas.findByRole('combobox', { name: 'Status' })).resolves.toBeVisible();
    await expect(canvasElement.querySelectorAll('mat-list-item').length).toBeGreaterThan(10);
    await expect((await canvas.findAllByRole('button', { name: 'Unificar' })).length).toBeGreaterThan(0);
    await userEvent.click(canvas.getByRole('button', { name: 'Verificar' }));
    await expect(scanCandidates).toHaveBeenCalled();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Buscar pessoa' }), 'sem-correspondencia');
    await userEvent.click(canvas.getByRole('button', { name: 'Atualizar' }));
    await expect(applyFilters).toHaveBeenCalled();
    await expect(canvas.findByText('Nenhum candidato neste status')).resolves.toBeVisible();
  },
};

export const MixedReviewQueue: Story = {
  args: { candidateCount: 40, statusScenario: 'MIXED', matchMethod: 'NORMALIZED_NAME' },
};

export const DenseQueue: Story = {
  args: { candidateCount: 100, statusScenario: 'PENDING', scoreStep: 0.005 },
};

export const Empty: Story = {
  args: { candidateCount: 0 },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhum candidato neste status')).toBeVisible();
  },
};

export const ReadOnly: Story = {
  args: { canMutate: false, candidateCount: 10 },
  play: async ({ canvasElement }) => {
    const buttons = await within(canvasElement).findAllByRole('button');
    await expect(buttons.filter((button) => button.hasAttribute('disabled')).length).toBeGreaterThan(4);
  },
};

export const LongNames: Story = {
  args: { candidateCount: 16, statusScenario: 'MIXED', longNames: true },
};
