import { ANONYMOUS_AUDIENCE, audienceContext } from './audience-context';
import { EventAudience } from '@prisma/client';
import { applyAudienceSettings, normalizeAudienceInput, withoutAudienceInput } from './audience-input';

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


describe('atomic audience edits', () => {
  it.each(['EVENT', 'EVENT_GROUP', 'MAJOR_EVENT'] as const)('relaxes %s before losing actor access and rechecks in the original scope', async (targetType) => {
    const principal = { ...ANONYMOUS_AUDIENCE, personIds: ['actor'] };
    let audience: EventAudience = EventAudience.INVITATION_ONLY;
    let invited = true;
    const update = jest.fn(async ({ data }) => {
      if (!audienceContext.getStore()?.bypass && !invited && audience === EventAudience.INVITATION_ONLY) throw new Error('hidden');
      audience = data.audience;
    });
    const read = jest.fn(async () => {
      expect(audienceContext.getStore()).toEqual(principal);
      expect(audience).toBe(EventAudience.PUBLIC);
      return { id: 'target' };
    });
    const tx = { event: { update, findUniqueOrThrow: read }, eventGroup: { update, findUniqueOrThrow: read }, majorEvent: { update, findUniqueOrThrow: read } };
    const invitations = { replaceInvitations: jest.fn(async () => { invited = false; return { invitations: [], addedPersonIds: [], removedPersonIds: ['actor'] }; }) };
    const result = await audienceContext.run(principal, () => applyAudienceSettings(tx as never, invitations as never,
      { targetType, targetId: 'target' }, { audience: EventAudience.PUBLIC, invitationPersonIds: [] }, { audience }));
    expect(result).toMatchObject({ invitationsChanged: true, previousInvitationPersonIds: ['actor'], invitationPersonIds: [] });
    expect(read).toHaveBeenCalledTimes(1);
    expect(audienceContext.getStore()).toBeUndefined();
  });

  it('rejects inaccessible resulting audiences before any invitation writes', async () => {
    const invitations = { replaceInvitations: jest.fn() };
    await expect(audienceContext.run({ ...ANONYMOUS_AUDIENCE, personIds: ['actor'] }, () =>
      applyAudienceSettings({} as never, invitations as never, { targetType: 'EVENT', targetId: 'target' },
        { audience: EventAudience.INVITATION_ONLY, invitationPersonIds: ['other'] })))
      .rejects.toThrow('permissão');
    expect(invitations.replaceInvitations).not.toHaveBeenCalled();
  });
});
