import { assertEventLocation, normalizeEventLocation } from './event-location';
import { formatEventLocation } from '@cacic-fct/shared-utils';
import { PUBLIC_EVENT_SELECT } from '../public-events/models';

describe('event location snapshots', () => {
  it('keeps a structured physical snapshot and trims optional notes', () => {
    const input = {
      locationName: ' Auditório ',
      locationDescription: ' Bloco 5 ',
      locationInternalNotes: ' **Chave** na secretaria ',
      latitude: 1,
      longitude: 2,
    };
    expect(normalizeEventLocation(input)).toEqual({
      ...input,
      locationName: 'Auditório',
      locationDescription: 'Bloco 5',
      locationInternalNotes: '**Chave** na secretaria',
    });
    expect(input.locationName).toBe(' Auditório ');
  });

  it('removes a physical place from virtual events while retaining internal operational notes', () => {
    expect(
      normalizeEventLocation({
        isVirtual: true,
        locationName: 'Auditório',
        latitude: 1,
        longitude: 2,
        locationInternalNotes: 'Testar áudio',
      }),
    ).toEqual({
      isVirtual: true,
      locationName: null,
      locationDescription: null,
      latitude: null,
      longitude: null,
      locationInternalNotes: 'Testar áudio',
    });
  });

  it('does not clear omitted values during a partial update', () => {
    expect(normalizeEventLocation({ locationName: 'Sala' })).toEqual({ locationName: 'Sala' });
    expect(normalizeEventLocation({ locationInternalNotes: '  ' })).toEqual({ locationInternalNotes: null });
  });

  it('bounds notes and public labels before storing them', () => {
    expect(() => normalizeEventLocation({ locationInternalNotes: 'x'.repeat(10001) })).toThrow();
    expect(() => normalizeEventLocation({ locationName: 'x'.repeat(251) })).toThrow();
    expect(() => normalizeEventLocation({ locationDescription: 'x'.repeat(2001) })).toThrow();
  });

  it.each([
    {},
    { locationName: 'Auditório' },
    { locationInternalNotes: 'Retirar a chave na secretaria' },
    { locationName: 'Auditório', locationDescription: 'Bloco 5', latitude: 0, longitude: 0 },
  ])('allows an optional location with an optional description: %j', (location) => {
    expect(() => assertEventLocation(location)).not.toThrow();
  });

  it.each([
    { locationDescription: 'Bloco 5' },
    { locationName: '  ', locationDescription: 'Bloco 5' },
    { latitude: 0, longitude: 0 },
  ])('rejects physical location data without a name: %j', (location) => {
    expect(() => assertEventLocation(location)).toThrow('Informe o nome do local');
  });

  it('checks description-only patches against the saved name and rejects removing it while details remain', () => {
    const current = { locationName: 'Auditório', locationDescription: 'Bloco 5' };
    expect(() =>
      assertEventLocation({ locationName: undefined, locationDescription: 'Bloco 6' }, current),
    ).not.toThrow();
    expect(() => assertEventLocation({ locationName: null }, current)).toThrow('Informe o nome do local');
    expect(() => assertEventLocation({ locationName: null, locationDescription: null }, current)).not.toThrow();
  });

  it('formats new and historical data without leaking admin notes', () => {
    expect(formatEventLocation({ locationName: 'Auditório', locationDescription: 'Bloco 5' })).toBe(
      'Auditório - Bloco 5',
    );
    expect(formatEventLocation({ locationName: 'Auditório' })).toBe('Auditório');
    expect(formatEventLocation({ locationDescription: 'Auditório - Bloco 5' })).toBe('Auditório - Bloco 5');
    expect(formatEventLocation({ isVirtual: true, locationName: 'Auditório' })).toBe('Evento on-line');
    expect(formatEventLocation({})).toBeNull();
    expect(PUBLIC_EVENT_SELECT).not.toHaveProperty('locationInternalNotes');
    expect(PUBLIC_EVENT_SELECT).not.toHaveProperty('subscriberInformation');
    for (const field of ['lecturerInformation', 'collectorInformation', 'materials']) {
      expect(PUBLIC_EVENT_SELECT).not.toHaveProperty(field);
    }
  });
});
