import { BadRequestException } from '@nestjs/common';
import { currentMcpValues, mcpFieldChanges, normalizedMcpChange, type McpChangeEvent } from './mcp-admin-change-policy';
import { mcpEventReviewFields, prepareMcpEventReview } from './mcp-event-review';

function event(): McpChangeEvent {
  const now = new Date();
  return {
    id: 'event-1',
    name: 'Evento',
    description: 'Descrição',
    shortDescription: null,
    createdAt: now,
    updatedAt: now,
    startDate: now,
    endDate: now,
    majorEventId: null,
    eventGroupId: null,
    publicationState: 'PUBLISHED',
    locationName: 'Sala',
    locationDescription: 'Prédio',
    isVirtual: false,
    latitude: -22,
    longitude: -51,
    lecturerInformation: null,
    collectorInformation: null,
    preparationUpdatedAt: null,
    youtubeCode: null,
    twitchChannel: null,
  };
}

describe('MCP event change policy', () => {
  it('displays every automatic location reset when switching to virtual', () => {
    const current = event();
    const after = normalizedMcpChange('EVENT_LOCATION', { isVirtual: true }, current);
    expect(after).toEqual({
      isVirtual: true,
      locationName: null,
      locationDescription: null,
      latitude: null,
      longitude: null,
    });
    const before = currentMcpValues(current, Object.keys(after));
    expect(mcpFieldChanges(before, after).map((change) => change.field)).toEqual(Object.keys(after));
  });

  it('only allows virtual location resets through their controlling field', () => {
    const current = event();
    const after = normalizedMcpChange('EVENT_LOCATION', { isVirtual: true }, current);
    const original = { before: currentMcpValues(current, Object.keys(after)), after };
    expect(mcpEventReviewFields(original)).toEqual([
      { field: 'isVirtual', label: 'Evento virtual', proposedValue: true },
    ]);
    expect(prepareMcpEventReview('EVENT_LOCATION', original, current, [{ field: 'isVirtual' }]).after).toEqual(after);
    expect(() =>
      prepareMcpEventReview('EVENT_LOCATION', original, current, [{ field: 'latitude', value: 40 }]),
    ).toThrow('Escolha somente campos editáveis');
    expect(() =>
      prepareMcpEventReview('EVENT_LOCATION', original, current, [{ field: 'isVirtual', value: false }]),
    ).toThrow('A seleção não modifica');
  });

  it('revalidates the coordinate pair when a reviewer includes only one part', () => {
    const current = event();
    const original = { before: { latitude: -22, longitude: -51 }, after: { latitude: null, longitude: null } };
    expect(() => prepareMcpEventReview('EVENT_LOCATION', original, current, [{ field: 'latitude' }])).toThrow(
      'Informe latitude e longitude juntas.',
    );
    expect(
      prepareMcpEventReview('EVENT_LOCATION', original, current, [{ field: 'latitude' }, { field: 'longitude' }]).after,
    ).toEqual(original.after);
  });

  it('does not let a reviewer keep the event virtual and add a physical location', () => {
    const current = {
      ...event(),
      isVirtual: true,
      locationName: null,
      locationDescription: null,
      latitude: null,
      longitude: null,
    };
    const after = normalizedMcpChange('EVENT_LOCATION', { isVirtual: false, locationName: 'Sala' }, current);
    const original = { before: currentMcpValues(current, Object.keys(after)), after };
    expect(() => prepareMcpEventReview('EVENT_LOCATION', original, current, [{ field: 'locationName' }])).toThrow(
      'Um evento virtual não pode manter informações de local físico.',
    );
  });

  it('blocks fields within the operation that the original proposal did not change', () => {
    const current = event();
    const original = {
      before: { name: current.name, description: current.description },
      after: {
        name: 'Outro nome',
        description: current.description,
      },
    };
    expect(() => prepareMcpEventReview('EVENT_CONTENT', original, current, [{ field: 'shortDescription' }])).toThrow(
      'Escolha somente campos editáveis',
    );
    expect(() =>
      prepareMcpEventReview('EVENT_CONTENT', original, current, [{ field: 'description', value: 'Nova descrição' }]),
    ).toThrow('Escolha somente campos editáveis');
  });

  it.each([{ latitude: 2 }, { latitude: 91, longitude: 2 }, { locationName: null }])(
    'rejects invalid physical location changes %j',
    (changes) => {
      const current = { ...event(), latitude: null, longitude: null };
      expect(() => normalizedMcpChange('EVENT_LOCATION', changes, current)).toThrow(BadRequestException);
    },
  );

  it('normalizes livestream provider URLs before review and persistence', () => {
    expect(
      normalizedMcpChange(
        'EVENT_LIVESTREAM',
        {
          youtubeCode: ' https://youtu.be/video_123?tracking=removed ',
          twitchChannel: 'https://www.twitch.tv/Example_Channel/videos',
        },
        event(),
      ),
    ).toEqual({ youtubeCode: 'video_123', twitchChannel: 'example_channel' });
  });

  it.each(['javascript:alert(1)', 'https://unknown.example/video', 'https://user:password@youtube.com/watch?v=abc'])(
    'rejects invalid livestream input %s',
    (youtubeCode) => {
      expect(() => normalizedMcpChange('EVENT_LIVESTREAM', { youtubeCode }, event())).toThrow(BadRequestException);
    },
  );

  it('normalizes empty preparation instructions to null', () => {
    expect(
      normalizedMcpChange(
        'EVENT_PREPARATION',
        {
          lecturerInformation: '  Orientações  ',
          collectorInformation: '  ',
        },
        event(),
      ),
    ).toEqual({ lecturerInformation: 'Orientações', collectorInformation: null });
  });

  it.each(['publicationState', 'majorEventId', 'eventGroupId', 'deletedAt', 'updatedById', 'materials'])(
    'rejects hidden field %s from content proposals',
    (field) => {
      expect(() => normalizedMcpChange('EVENT_CONTENT', { name: 'Novo nome', [field]: 'hidden' }, event())).toThrow(
        BadRequestException,
      );
    },
  );

  it('rejects empty changes and preserves typed before values', () => {
    expect(() => normalizedMcpChange('EVENT_CONTENT', {}, event())).toThrow(BadRequestException);
    expect(currentMcpValues(event(), ['isVirtual', 'latitude', 'shortDescription'])).toEqual({
      isVirtual: false,
      latitude: -22,
      shortDescription: null,
    });
    expect(mcpFieldChanges({ isVirtual: false, latitude: -22 }, { isVirtual: true, latitude: null })).toEqual([
      { field: 'isVirtual', label: 'Evento virtual', before: 'Não', after: 'Sim' },
      { field: 'latitude', label: 'Latitude', before: '-22', after: null },
    ]);
  });
});
