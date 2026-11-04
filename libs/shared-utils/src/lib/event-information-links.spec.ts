import { eventInformationPath, eventInformationRoute } from './event-information-links';

describe('event information links', () => {
  it.each(['event', 'event-group', 'major-event'] as const)(
    'keeps %s route identifiers raw for Angular and encodes server paths',
    (targetType) => {
      const id = 'atividade / ciência?edição=2';
      expect(eventInformationRoute(targetType, id)).toEqual([`/${targetType}`, id]);
      expect(eventInformationPath(targetType, id)).toBe(
        `/${targetType}/atividade%20%2F%20ci%C3%AAncia%3Fedi%C3%A7%C3%A3o%3D2`,
      );
    },
  );
});
