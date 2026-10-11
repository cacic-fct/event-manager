import { eventContentAuditSnapshot } from './event-content-audit';

describe('eventContentAuditSnapshot', () => {
  it('keeps content settings and assigned person ids without copying participants or parent events', () => {
    expect(eventContentAuditSnapshot({
      id: 'event-1',
      name: 'Evento',
      description: 'Own content',
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      majorEvent: { id: 'major-1', description: 'Large parent content' },
      eventGroup: { id: 'group-1', name: 'Parent group' },
      sportsMatch: { id: 'match-1' },
      attendances: [{ personId: 'attendee-1', email: 'private@example.com' }],
      lecturers: [{ personId: 'lecturer-2' }, { personId: 'lecturer-1' }, { personId: 'lecturer-1' }],
      audienceInvitations: [{ personId: 'invitee-1', person: { name: 'Invitee' } }],
      createdAt: new Date(),
      createdById: 'admin-1',
    })).toEqual({
      id: 'event-1',
      name: 'Evento',
      description: 'Own content',
      majorEventId: 'major-1',
      eventGroupId: 'group-1',
      lecturerPersonIds: ['lecturer-1', 'lecturer-2'],
      invitationPersonIds: ['invitee-1'],
    });
  });

  it('keeps audited invitation changes and payment settings while excluding sports backing records', () => {
    const paymentInfo = { bankName: 'Banco', pixKey: 'chave' };
    const majorEventPrices = [{ type: 'GENERAL', tiers: [{ id: 'tier-1', value: 50 }] }];
    expect(eventContentAuditSnapshot({
      invitationPersonIds: ['new-invitee'],
      audienceInvitations: [{ personId: 'old-invitee' }],
      paymentInfo,
      majorEventPrices,
      sportsTournament: [{ id: 'tournament-1' }],
    })).toEqual({ invitationPersonIds: ['new-invitee'], paymentInfo, majorEventPrices });
  });
});
