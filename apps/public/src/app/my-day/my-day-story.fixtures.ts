import type {
  CurrentUserMyDay,
  MyDayAttentionItem,
  MyDayEvent,
  MyDayWeatherAlert,
} from '@cacic-fct/event-manager-public-contracts';
import { fakerPT_BR as faker } from '@faker-js/faker';
import type { MyDayLoadState } from './my-day.store';
import { myDayDateKey } from './my-day-date';

export type MyDayStoryState = 'ready' | 'offline' | 'empty' | 'loading' | 'error';

export interface MyDayStoryControls {
  state: MyDayStoryState;
  userName: string;
  currentEvent: boolean;
  nextEvent: boolean;
  laterEventCount: number;
  attentionCount: number;
  weatherCount: number;
  collectorRole: boolean;
  sportsOperatorRole: boolean;
  eventNamePrefix: string;
  locationDescription: string;
  cooldownSeconds: number;
}

export const myDayStoryDefaultControls: MyDayStoryControls = {
  state: 'ready',
  userName: 'Marina Costa',
  currentEvent: true,
  nextEvent: true,
  laterEventCount: 4,
  attentionCount: 3,
  weatherCount: 3,
  collectorRole: true,
  sportsOperatorRole: true,
  eventNamePrefix: '',
  locationDescription: 'Auditório 1',
  cooldownSeconds: 0,
};

export const myDayStoryControlArgTypes = {
  state: { control: 'select', options: ['ready', 'offline', 'empty', 'loading', 'error'] },
  userName: { control: 'text' },
  currentEvent: { control: 'boolean' },
  nextEvent: { control: 'boolean' },
  laterEventCount: { control: { type: 'range', min: 0, max: 12, step: 1 } },
  attentionCount: { control: { type: 'range', min: 0, max: 9, step: 1 } },
  weatherCount: { control: { type: 'range', min: 0, max: 8, step: 1 } },
  collectorRole: { control: 'boolean' },
  sportsOperatorRole: { control: 'boolean' },
  eventNamePrefix: { control: 'text' },
  locationDescription: { control: 'text' },
  cooldownSeconds: { control: { type: 'range', min: 0, max: 120, step: 1 } },
} as const;

export function createMyDayStoryState(controls: MyDayStoryControls): MyDayLoadState {
  if (controls.state === 'loading') {
    return { status: 'loading', data: null, offline: false };
  }
  if (controls.state === 'error') {
    return {
      status: 'error',
      data: null,
      offline: false,
      message: 'Não foi possível atualizar sua agenda de demonstração.',
    };
  }

  return {
    status: 'ready',
    data: createMyDayStoryData(controls),
    offline: controls.state === 'offline',
  };
}

export function createMyDayStoryData(controls: MyDayStoryControls): CurrentUserMyDay {
  const now = new Date();
  const isEmpty = controls.state === 'empty';
  faker.seed(20_260_818);

  const currentStart = minutesFrom(now, -20);
  const currentEnd = minutesFrom(now, 25);
  const nextStart = minutesFrom(now, 42);
  const nextEnd = minutesFrom(nextStart, 60);

  const currentEvent =
    !isEmpty && controls.currentEvent
      ? createMyDayStoryEvent(controls, 0, currentStart, currentEnd, {
          name: 'Credenciamento',
          emoji: '✅',
          collectAttendance: controls.collectorRole,
        })
      : null;
  const nextEvent =
    !isEmpty && controls.nextEvent
      ? createMyDayStoryEvent(controls, 1, nextStart, nextEnd, {
          name: 'Arquitetura Angular com Signals',
          emoji: '🧠',
          sportsOperator: controls.sportsOperatorRole,
        })
      : null;
  const laterCount = isEmpty ? 0 : clampCount(controls.laterEventCount, 12);
  const laterEvents = Array.from({ length: laterCount }, (_, index) => {
    const start = minutesFrom(nextEnd, 70 + index * 95);
    return createMyDayStoryEvent(controls, index + 2, start, minutesFrom(start, 60 + (index % 3) * 15));
  });

  return {
    generatedAt: now.toISOString(),
    selectedDate: myDayDateKey(now),
    minimumDate: myDayDateKey(new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())),
    hasContent: !isEmpty,
    currentEvent,
    nextEvent,
    laterEvents,
    attention: isEmpty ? [] : createAttentionItems(controls.attentionCount),
    weather: isEmpty ? [] : createWeatherAlerts(controls.weatherCount, nextEvent ?? laterEvents[0], nextStart),
  };
}

function createMyDayStoryEvent(
  controls: MyDayStoryControls,
  index: number,
  startDate: Date,
  endDate: Date,
  options: { name?: string; emoji?: string; collectAttendance?: boolean; sportsOperator?: boolean } = {},
): MyDayEvent {
  const id = `my-day-story-${index + 1}`;
  const generatedName = [
    'Vôlei misto',
    'Oficina de prototipação',
    'Mesa-redonda de extensão',
    'Laboratório de inteligência artificial',
    'Encontro de comunidades',
  ][index % 5];
  const name = `${controls.eventNamePrefix.trim()}${controls.eventNamePrefix.trim() ? ' ' : ''}${
    options.name ?? `${generatedName} · ${faker.word.adjective()}`
  }`;

  return {
    id,
    name,
    emoji: options.emoji ?? ['🏐', '🎨', '💬', '🤖', '🧭'][index % 5],
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    locationDescription: controls.locationDescription,
    roles: [
      ...(options.collectAttendance ? [{ kind: 'ATTENDANCE_COLLECTOR' as const, label: 'Coleta de presença' }] : []),
      ...(options.sportsOperator ? [{ kind: 'OFFICIAL' as const, label: 'Oficial da partida' }] : []),
    ],
    attendanceAction: options.collectAttendance
      ? {
          kind: 'COLLECT_ATTENDANCE',
          label: 'Coletar presenças',
          materialIcon: 'qr_code_scanner',
          route: `/attendance/collect/${id}/method`,
          offlineCapable: true,
        }
      : null,
    sportsActions: options.sportsOperator
      ? [
          {
            kind: 'SPORTS_OPERATE',
            label: 'Operar partida',
            materialIcon: 'sports_score',
            route: `/sports/match/${id}/operate`,
            offlineCapable: false,
          },
        ]
      : [],
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

function createAttentionItems(count: number): MyDayAttentionItem[] {
  const templates = [
    {
      kind: 'PAYMENT' as const,
      title: 'Envie seu comprovante',
      description: 'Sua inscrição aguarda o comprovante de pagamento.',
      materialIcon: 'receipt_long',
      priority: 10,
      offlineCapable: false,
    },
    {
      kind: 'CONFLICT' as const,
      title: 'Conflito de horário',
      description: 'Dois compromissos se sobrepõem.',
      materialIcon: 'event_busy',
      priority: 50,
      offlineCapable: true,
    },
    {
      kind: 'SUBSCRIPTION' as const,
      title: 'Escolha suas atividades',
      description: 'Ainda há vagas em atividades compatíveis com sua agenda.',
      materialIcon: 'event_available',
      priority: 20,
      offlineCapable: false,
    },
  ];

  return Array.from({ length: clampCount(count, 9) }, (_, index) => {
    const template = templates[index % templates.length];
    return { ...template, id: `attention:${index + 1}`, route: `/story/attention/${index + 1}` };
  });
}

function createWeatherAlerts(
  count: number,
  event: MyDayEvent | null | undefined,
  forecastTime: Date,
): MyDayWeatherAlert[] {
  const templates = [
    { kind: 'RAIN' as const, title: 'Pode chover', advice: 'Leve um guarda-chuva.', materialIcon: 'rainy' },
    { kind: 'UV' as const, title: 'Índice UV elevado', advice: 'Use protetor solar.', materialIcon: 'sunny' },
    {
      kind: 'HEAT' as const,
      title: 'Calor intenso',
      advice: 'Leve água e procure sombra.',
      materialIcon: 'thermostat',
    },
    { kind: 'COLD' as const, title: 'Queda de temperatura', advice: 'Leve um agasalho.', materialIcon: 'ac_unit' },
  ];
  const eventId = event?.id ?? 'my-day-story-weather';
  const eventName = event?.name ?? 'Compromisso da agenda';

  return Array.from({ length: clampCount(count, 8) }, (_, index) => {
    const template = templates[index % templates.length];
    return {
      ...template,
      id: `weather:${index + 1}`,
      eventId,
      eventName,
      forecastTime: minutesFrom(forecastTime, index * 30).toISOString(),
      temperature: 18 + index * 2,
      uvIndex: template.kind === 'UV' ? 6 + (index % 3) : null,
      route: `/event/${eventId}`,
    };
  });
}

function minutesFrom(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function clampCount(value: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), 0), max);
}
