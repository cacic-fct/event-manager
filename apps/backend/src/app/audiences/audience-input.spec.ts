import { EventAudience } from '@prisma/client';
import { normalizeAudienceInput, withoutAudienceInput } from './audience-input';

describe('audience configuration', () => {
  it('keeps legacy/default targets public and removes stale course restrictions when changing audience', () => {
    expect(normalizeAudienceInput({})).toEqual({ audience: EventAudience.PUBLIC, audienceCourseCodes: [] });
    expect(normalizeAudienceInput({ audience: EventAudience.UNESP_ONLY }, { audience: EventAudience.COURSE_ONLY, audienceCourseCodes: ['12'] }))
      .toEqual({ audience: EventAudience.UNESP_ONLY, audienceCourseCodes: [] });
  });

  it('fails closed for missing, unknown or malformed course restrictions', () => {
    expect(() => normalizeAudienceInput({ audience: EventAudience.COURSE_ONLY })).toThrow('Select a course');
    expect(() => normalizeAudienceInput({ audience: EventAudience.COURSE_ONLY, audienceCourseCodes: ['13'] })).toThrow('Only the Computer Science');
    expect(() => normalizeAudienceInput({ audience: null })).toThrow('cannot be null');
    expect(() => normalizeAudienceInput({ audience: 'OTHER' as EventAudience })).toThrow('Invalid event audience');
  });

  it('preserves course configuration for invitation-list-only edits and deduplicates known courses', () => {
    expect(normalizeAudienceInput({ invitationPersonIds: [] }, { audience: EventAudience.COURSE_ONLY, audienceCourseCodes: ['12'] }))
      .toEqual({ audience: EventAudience.COURSE_ONLY, audienceCourseCodes: ['12'] });
    expect(normalizeAudienceInput({ audience: EventAudience.COURSE_ONLY, audienceCourseCodes: ['12', '12'] }).audienceCourseCodes).toEqual(['12']);
  });

  it('bounds invitation requests before querying people and keeps relation inputs out of Prisma scalar writes', () => {
    expect(() => normalizeAudienceInput({ invitationPersonIds: Array.from({ length: 1001 }, (_, i) => `person-${i}`) })).toThrow('at most 1000');
    expect(() => normalizeAudienceInput({ invitationPersonIds: [''] })).toThrow('valid people');
    expect(withoutAudienceInput({ name: 'Evento', audience: EventAudience.INVITATION_ONLY, audienceCourseCodes: [], invitationPersonIds: ['person-1'] })).toEqual({ name: 'Evento' });
  });
});
