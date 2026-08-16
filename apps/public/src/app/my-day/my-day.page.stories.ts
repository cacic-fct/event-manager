import { provideRouter } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { CurrentUserMyDay, MyDayEvent } from '@cacic-fct/event-manager-public-contracts';
import { applicationConfig, type Meta, type StoryObj } from '@storybook/angular';
import { expect, within } from 'storybook/test';
import { MyDayPage } from './my-day.page';
import { MyDayStore, type MyDayLoadState } from './my-day.store';
import { myDayDateKey } from './my-day-date';

type MyDayStoryState = 'full' | 'offline' | 'empty';

interface MyDayStoryArgs {
  state: MyDayStoryState;
}

let activeArgs: MyDayStoryArgs = { state: 'full' };

const meta: Meta<MyDayStoryArgs> = {
  component: MyDayPage,
  title: 'CACiC Eventos/My Day/Personal Companion',
  tags: ['autodocs'],
  args: { state: 'full' },
  argTypes: {
    state: {
      control: 'inline-radio',
      options: ['full', 'offline', 'empty'],
      description: 'Estado operacional da agenda personalizada.',
    },
  },
  render: (args) => {
    activeArgs = args;
    return { props: {} };
  },
  decorators: [
    applicationConfig({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user: () => ({ sub: 'storybook-user', claims: { name: 'Marina Costa' } }),
          },
        },
        {
          provide: MyDayStore,
          useValue: {
            state: (): MyDayLoadState => storyState(activeArgs.state),
            data: () => storyState(activeArgs.state).data,
            selectedDate: () => myDayDateKey(new Date()),
            start: () => undefined,
            load: () => Promise.resolve(),
            refresh: () => Promise.resolve(),
          },
        },
      ],
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    viewport: { defaultViewport: 'mobile' },
    docs: {
      description: {
        component:
          'Companheiro diário móvel com contexto atual, próximo compromisso, ações prioritárias, clima e agenda futura.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<MyDayStoryArgs>;

export const Playground: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { name: 'Agora' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Próximo compromisso' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Atenção' })).toBeVisible();
    await expect(canvas.getByRole('heading', { name: 'Depois' })).toBeVisible();
  },
};

export const Offline: Story = {
  args: { state: 'offline' },
  globals: { theme: 'dark', network: 'offline', motion: 'reduced' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Dados salvos')).toBeVisible();
    await expect(canvas.queryByText('Envie seu comprovante')).not.toBeInTheDocument();
    await expect(canvas.getByRole('link', { name: /Coletar presenças/ })).toBeVisible();
  },
};

export const EmptyDay: Story = {
  args: { state: 'empty' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('Nada marcado para este dia')).toBeVisible();
  },
};

function storyState(state: MyDayStoryState): MyDayLoadState {
  const data = state === 'empty' ? emptyDay() : fullDay();
  return { status: 'ready', data, offline: state === 'offline' };
}

function fullDay(): CurrentUserMyDay {
  const now = new Date();
  const currentStart = new Date(now.getTime() - 20 * 60_000);
  const currentEnd = new Date(now.getTime() + 25 * 60_000);
  const nextStart = new Date(now.getTime() + 42 * 60_000);
  const nextEnd = new Date(nextStart.getTime() + 60 * 60_000);
  const laterStart = new Date(nextEnd.getTime() + 90 * 60_000);
  const laterEnd = new Date(laterStart.getTime() + 75 * 60_000);
  return {
    generatedAt: now.toISOString(),
    selectedDate: myDayDateKey(now),
    minimumDate: myDayDateKey(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())),
    hasContent: true,
    currentEvent: storyEvent('current', 'Credenciamento', '✅', currentStart, currentEnd, true),
    nextEvent: storyEvent('next', 'Arquitetura Angular com Signals', '🧠', nextStart, nextEnd, false),
    laterEvents: [storyEvent('later', 'Vôlei misto', '🏐', laterStart, laterEnd, false)],
    attention: [
      {
        id: 'payment:storybook',
        kind: 'PAYMENT',
        title: 'Envie seu comprovante',
        description: 'Sua inscrição aguarda o comprovante de pagamento.',
        materialIcon: 'receipt_long',
        route: '/major-event/storybook/payment',
        priority: 10,
        offlineCapable: false,
      },
      {
        id: 'conflict:storybook',
        kind: 'CONFLICT',
        title: 'Conflito de horário',
        description: 'Dois compromissos se sobrepõem.',
        materialIcon: 'event_busy',
        route: '/event/next',
        priority: 50,
        offlineCapable: true,
      },
    ],
    weather: [
      {
        id: 'weather:rain',
        kind: 'RAIN',
        title: 'Pode chover',
        advice: 'Leve um guarda-chuva.',
        materialIcon: 'rainy',
        eventId: 'next',
        eventName: 'Arquitetura Angular com Signals',
        forecastTime: nextStart.toISOString(),
        temperature: 22,
        route: '/event/next',
      },
      {
        id: 'weather:uv',
        kind: 'UV',
        title: 'Índice UV elevado',
        advice: 'Use protetor solar.',
        materialIcon: 'sunny',
        eventId: 'later',
        eventName: 'Vôlei misto',
        forecastTime: laterStart.toISOString(),
        temperature: 29,
        uvIndex: 6,
        route: '/event/later',
      },
    ],
  };
}

function emptyDay(): CurrentUserMyDay {
  const now = new Date();
  return {
    generatedAt: now.toISOString(),
    selectedDate: myDayDateKey(now),
    minimumDate: myDayDateKey(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())),
    hasContent: true,
    currentEvent: null,
    nextEvent: null,
    laterEvents: [],
    attention: [],
    weather: [],
  };
}

function storyEvent(
  id: string,
  name: string,
  emoji: string,
  startDate: Date,
  endDate: Date,
  collectAttendance: boolean,
): MyDayEvent {
  return {
    id,
    name,
    emoji,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    locationDescription: 'Auditório 1',
    roles: collectAttendance ? [{ kind: 'ATTENDANCE_COLLECTOR', label: 'Coleta de presença' }] : [],
    attendanceAction: collectAttendance
      ? {
          kind: 'COLLECT_ATTENDANCE',
          label: 'Coletar presenças',
          materialIcon: 'qr_code_scanner',
          route: `/attendance/collect/${id}/method`,
          offlineCapable: true,
        }
      : null,
    sportsActions: [],
    infoAction: {
      kind: 'EVENT_INFO',
      label: 'Informações',
      materialIcon: 'info',
      route: `/event/${id}`,
      offlineCapable: true,
    },
    mapAction: {
      kind: 'MAP',
      label: 'Ver no mapa',
      materialIcon: 'location_on',
      route: `/map?evento=${id}`,
      offlineCapable: true,
    },
  };
}
