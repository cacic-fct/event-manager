import type { DateTimeString } from './common';

export type MyDayRoleKind = 'LECTURER' | 'ATTENDANCE_COLLECTOR' | 'ORGANIZER' | 'ATHLETE' | 'OFFICIAL';

export interface MyDayRole {
  kind: MyDayRoleKind;
  label: string;
}

export type MyDayActionKind =
  | 'EVENT_INFO'
  | 'MAP'
  | 'SELF_ATTENDANCE'
  | 'COLLECT_ATTENDANCE'
  | 'SPORTS_MATCH'
  | 'SPORTS_OPERATE';

export interface MyDayAction {
  kind: MyDayActionKind;
  label: string;
  materialIcon: string;
  route: string;
  offlineCapable: boolean;
}

export interface MyDayEvent {
  id: string;
  name: string;
  emoji: string;
  startDate: DateTimeString;
  endDate: DateTimeString;
  locationDescription?: string | null;
  roles: MyDayRole[];
  attendanceAction?: MyDayAction | null;
  sportsActions: MyDayAction[];
  infoAction: MyDayAction;
  mapAction?: MyDayAction | null;
}

export type MyDayAttentionKind = 'PAYMENT' | 'SUBSCRIPTION' | 'CONFLICT';

export interface MyDayAttentionItem {
  id: string;
  kind: MyDayAttentionKind;
  title: string;
  description: string;
  materialIcon: string;
  route: string;
  priority: number;
  offlineCapable: boolean;
}

export type MyDayWeatherKind = 'THUNDERSTORM' | 'RAIN' | 'COLD' | 'HEAT' | 'UV';

export interface MyDayWeatherAlert {
  id: string;
  kind: MyDayWeatherKind;
  title: string;
  advice: string;
  materialIcon: string;
  eventId: string;
  eventName: string;
  forecastTime: DateTimeString;
  temperature: number;
  uvIndex?: number | null;
  route: string;
}

export interface CurrentUserMyDay {
  generatedAt: DateTimeString;
  selectedDate: string;
  minimumDate: string;
  hasContent: boolean;
  currentEvent?: MyDayEvent | null;
  nextEvent?: MyDayEvent | null;
  laterEvents: MyDayEvent[];
  attention: MyDayAttentionItem[];
  weather: MyDayWeatherAlert[];
}
