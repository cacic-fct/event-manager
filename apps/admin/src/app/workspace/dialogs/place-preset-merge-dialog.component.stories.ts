import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, computed, inject, input } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { Meta, StoryObj } from '@storybook/angular';
import { expect, userEvent, within } from 'storybook/test';
import type { PlacePreset } from '../../graphql/models';
import { PlacePresetMergeDialogComponent } from './place-preset-merge-dialog.component';

faker.seed(20260616);

type PlacePresetMergeStoryArgs = {
  targetName: string;
  sourceName: string;
  targetHasCoordinates: boolean;
  sourceHasDescription: boolean;
};

const dialogRefMock = {
  close: () => undefined,
};

function placePreset(id: string, name: string, options: { coordinates: boolean; description: boolean }): PlacePreset {
  return {
    id,
    name,
    latitude: options.coordinates ? -22.1211 + faker.number.float({ min: -0.002, max: 0.002 }) : null,
    longitude: options.coordinates ? -51.4086 + faker.number.float({ min: -0.002, max: 0.002 }) : null,
    locationDescription: options.description ? faker.helpers.arrayElement(['Bloco B, sala 12', 'Auditório principal']) : null,
    deletedAt: null,
    createdAt: '2026-05-16T12:00:00.000Z',
    createdById: 'storybook-admin',
    updatedAt: '2026-05-16T12:00:00.000Z',
    updatedById: 'storybook-admin',
  };
}

@Component({
  selector: 'app-storybook-place-preset-merge-dialog-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  template: `<ng-container *ngComponentOutlet="component; injector: storyInjector()" />`,
})
class PlacePresetMergeDialogStoryHostComponent {
  private readonly injector = inject(Injector);

  readonly component = PlacePresetMergeDialogComponent;
  readonly targetName = input('Auditório Discente');
  readonly sourceName = input('Auditório Central');
  readonly targetHasCoordinates = input(true);
  readonly sourceHasDescription = input(true);

  readonly storyInjector = computed(() =>
    Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            target: placePreset('place-target', this.targetName(), {
              coordinates: this.targetHasCoordinates(),
              description: true,
            }),
            source: placePreset('place-source', this.sourceName(), {
              coordinates: true,
              description: this.sourceHasDescription(),
            }),
          },
        },
        { provide: MatDialogRef, useValue: dialogRefMock },
      ],
    }),
  );
}

const meta: Meta<PlacePresetMergeStoryArgs> = {
  component: PlacePresetMergeDialogStoryHostComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Place Preset Merge Dialog',
  tags: ['autodocs'],
  args: {
    targetName: 'Auditório Discente',
    sourceName: 'Auditório Central',
    targetHasCoordinates: true,
    sourceHasDescription: true,
  },
  argTypes: {
    targetName: { control: 'text' },
    sourceName: { control: 'text' },
    targetHasCoordinates: { control: 'boolean' },
    sourceHasDescription: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<PlacePresetMergeStoryArgs>;

async function exerciseStory(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await expect(await canvas.findByText('Unificar locais duplicados')).toBeVisible();
  await userEvent.click(await canvas.findByRole('tab', { name: /manter auditório central/i }));
}

export const Playground: Story = {
  play: async ({ canvasElement }) => exerciseStory(canvasElement),
};

export const MissingTargetCoordinates: Story = {
  args: {
    targetName: 'Local antigo',
    sourceName: 'Laboratório de Software',
    targetHasCoordinates: false,
  },
  parameters: {
    viewport: { defaultViewport: 'mobile' },
  },
};
