import { assertAudiencePublicationReady } from './audience-publication';

describe('audience publication readiness', () => {
  it('does not change public, Unesp or course publication eligibility', () => {
    for (const audience of ['PUBLIC', 'UNESP_ONLY', 'COURSE_ONLY']) {
      expect(() => assertAudiencePublicationReady({ audience })).not.toThrow();
    }
  });

  it('requires an active invitee before an invitation-only target can be published', () => {
    expect(() => assertAudiencePublicationReady({ audience: 'INVITATION_ONLY', audienceInvitations: [] })).toThrow('pessoa convidada');
    expect(() => assertAudiencePublicationReady({ audience: 'INVITATION_ONLY', audienceInvitations: [{ personId: 'person-1' }] })).not.toThrow();
  });

  it('requires invitations at the effective attendance-policy owner', () => {
    expect(() => assertAudiencePublicationReady({ audience: 'PUBLIC', attendanceEligibility: 'INVITED_ONLY' })).toThrow('confirmar presença');
    const parent = { attendanceEligibility: 'INVITED_ONLY', audienceInvitations: [] };
    for (const relation of ['eventGroup', 'majorEvent'] as const) {
      expect(() => assertAudiencePublicationReady({ [relation]: parent, audienceInvitations: [{ personId: 'child-invitee' }] })).toThrow('confirmar presença');
      expect(() => assertAudiencePublicationReady({ [relation]: { ...parent, audienceInvitations: [{ personId: 'parent-invitee' }] } })).not.toThrow();
      expect(() => assertAudiencePublicationReady({ attendanceEligibility: 'ANYONE', [relation]: parent })).not.toThrow();
      expect(() => assertAudiencePublicationReady({ [relation]: { ...parent, deletedAt: new Date() } })).not.toThrow();
    }
  });

  it('keeps an empty invitation-only parent from being bypassed through a public child', () => {
    expect(() => assertAudiencePublicationReady({
      audience: 'PUBLIC',
      eventGroup: { audience: 'INVITATION_ONLY', audienceInvitations: [] },
    })).toThrow('pessoa convidada');
    expect(() => assertAudiencePublicationReady({
      audience: 'PUBLIC',
      majorEvent: { audience: 'INVITATION_ONLY', audienceInvitations: [] },
    })).toThrow('pessoa convidada');
  });
});
