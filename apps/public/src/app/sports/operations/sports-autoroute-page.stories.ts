import { provideRouter } from '@angular/router';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { NEVER, of } from 'rxjs';
import { expect, within } from 'storybook/test';
import { SportsAutoroutePage } from './sports-autoroute-page';
import { SportsOperationsApiService } from './sports-operations-api.service';

type AutorouteState = 'loading' | 'empty';

interface AutorouteStoryArgs {
  state: AutorouteState;
}

let activeState: AutorouteState = 'empty';

const meta: Meta<AutorouteStoryArgs> = {
  component: SportsAutoroutePage,
  title: 'CACiC Eventos/Sports/Operations/Autoroute',
  tags: ['autodocs'],
  args: { state: 'empty' },
  argTypes: {
    state: { control: 'inline-radio', options: ['loading', 'empty'] },
  },
  render: (args) => {
    activeState = args.state;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: SportsOperationsApiService,
          useValue: {
            autoroute: () => {
              if (activeState === 'loading') {
                return NEVER;
              }
              return of(null);
            },
          },
        },
      ],
    }),
  ],
  parameters: { layout: 'fullscreen', a11y: { test: 'todo' } },
};

export default meta;
type Story = StoryObj<AutorouteStoryArgs>;

export const Loading: Story = {
  args: { state: 'loading' },
};

export const Playground: Story = {
  name: 'Nenhuma partida próxima',
  args: { state: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Nenhuma partida para operar agora')).toBeVisible();
  },
};
