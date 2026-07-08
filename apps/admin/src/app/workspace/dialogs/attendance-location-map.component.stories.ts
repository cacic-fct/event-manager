import type { Meta, StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { AttendanceLocationMapComponent } from './attendance-location-map.component';

type AttendanceLocationMapStoryArgs = {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  markerLabel: string;
  ariaLabel: string;
};

const meta: Meta<AttendanceLocationMapStoryArgs> = {
  component: AttendanceLocationMapComponent,
  title: 'CACiC Eventos/Workspace/Dialogs/Attendance Location Map',
  tags: ['autodocs'],
  args: {
    latitude: -22.1211,
    longitude: -51.4086,
    accuracyMeters: 35,
    markerLabel: 'Presença coletada no Auditório I',
    ariaLabel: 'Mapa do local onde a presença foi coletada',
  },
  argTypes: {
    latitude: { control: { type: 'number', min: -90, max: 90, step: 0.0001 } },
    longitude: { control: { type: 'number', min: -180, max: 180, step: 0.0001 } },
    accuracyMeters: { control: { type: 'number', min: 0, max: 500, step: 1 } },
    markerLabel: { control: 'text' },
    ariaLabel: { control: 'text' },
  },
  parameters: {
    layout: 'fullscreen',
    a11y: { test: 'todo' },
  },
};

export default meta;

type Story = StoryObj<AttendanceLocationMapStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('img', { name: /mapa do local/i })).toBeVisible();
  },
};

export const WithoutAccuracy: Story = {
  args: {
    accuracyMeters: null,
    markerLabel: 'Presença sem precisão informada',
  },
};

export const MissingLocation: Story = {
  args: {
    latitude: null,
    longitude: null,
    accuracyMeters: null,
    markerLabel: '',
    ariaLabel: 'Mapa indisponível para presença sem localização',
  },
};

