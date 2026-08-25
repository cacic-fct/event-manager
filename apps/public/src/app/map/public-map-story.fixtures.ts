import type { PublicMapEvent } from '@cacic-fct/event-manager-public-contracts';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { DEFAULT_MAP_CENTER } from '@cacic-fct/shared-utils';
import { fakerPT_BR as faker } from '@faker-js/faker';

export type PublicMapCoordinateLayout = 'spread' | 'nearby' | 'coincident';

export interface PublicMapEventFixtureControls {
  centerLatitude: number;
  centerLongitude: number;
  coordinateLayout: PublicMapCoordinateLayout;
  eventCount: number;
  eventDurationMinutes: number;
  eventNamePrefix: string;
  firstEventDayOffset: number;
  spreadRadiusMeters: number;
}

export const publicMapStoryCenter = {
  longitude: DEFAULT_MAP_CENTER[0],
  latitude: DEFAULT_MAP_CENTER[1],
};

const defaultEventTheme = { emoji: '🎓', name: 'Abertura acadêmica', place: 'Auditório principal' };
const eventThemes = [
  defaultEventTheme,
  { emoji: '🧠', name: 'Laboratório de inteligência artificial', place: 'Laboratório 01' },
  { emoji: '♿', name: 'Acessibilidade em produtos digitais', place: 'Sala de metodologias ativas' },
  { emoji: '🎨', name: 'Oficina de interfaces', place: 'Laboratório de design' },
  { emoji: '🔐', name: 'Segurança aplicada', place: 'Sala 08' },
  { emoji: '🤖', name: 'Robótica para a comunidade', place: 'Pátio central' },
];

export function createPublicMapStoryEvents(controls: PublicMapEventFixtureControls): PublicMapEvent[] {
  faker.seed(
    20260817 + controls.eventCount * 13 + Math.round(controls.spreadRadiusMeters) + controls.firstEventDayOffset * 17,
  );

  return Array.from({ length: controls.eventCount }, (_, index) => {
    const theme = eventThemes[index % eventThemes.length] ?? defaultEventTheme;
    const start = new Date(publicFixtureDateFromNow(controls.firstEventDayOffset + (index % 3), 9 + (index % 8)));
    const end = new Date(start.getTime() + controls.eventDurationMinutes * 60_000);
    const [longitude, latitude] = storyCoordinates(index, controls);
    const generatedSuffix = index >= eventThemes.length ? ` · ${faker.word.adjective()}` : '';

    return {
      id: `map-event-${index + 1}`,
      name: `${controls.eventNamePrefix}${theme.name}${generatedSuffix}`,
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      emoji: theme.emoji,
      longitude,
      latitude,
      locationDescription: `${theme.place} · FCT-Unesp`,
    };
  });
}

export function createPublicMapStoryMineIds(eventCount: number, mineCount: number): string[] {
  return Array.from({ length: Math.min(eventCount, mineCount) }, (_, index) => `map-event-${index + 1}`);
}

function storyCoordinates(index: number, controls: PublicMapEventFixtureControls): [number, number] {
  if (controls.coordinateLayout === 'coincident') {
    return [controls.centerLongitude, controls.centerLatitude];
  }

  const maximumRadius =
    controls.coordinateLayout === 'nearby'
      ? Math.min(controls.spreadRadiusMeters, 18)
      : Math.max(controls.spreadRadiusMeters, 80);
  const ring = 1 + Math.floor(index / 8);
  const radiusMeters = Math.min(
    maximumRadius,
    maximumRadius * Math.sqrt((index + 1) / Math.max(1, controls.eventCount)),
  );
  const angle = index * 2.399963229728653 + ring * 0.11;
  const latitudeDelta = (Math.sin(angle) * radiusMeters) / 111_320;
  const longitudeMetersPerDegree = 111_320 * Math.cos((controls.centerLatitude * Math.PI) / 180);
  const longitudeDelta = (Math.cos(angle) * radiusMeters) / longitudeMetersPerDegree;
  return [controls.centerLongitude + longitudeDelta, controls.centerLatitude + latitudeDelta];
}
