import { BadRequestException } from '@nestjs/common';
import { SportsRosterRole } from '@prisma/client';
import { SportsMatchRosterSupportService, type SportsRosterEntryWrite } from './sports-match-roster-support.service';

class TestRosterSupport extends SportsMatchRosterSupportService {
  normalize(entries: SportsRosterEntryWrite[]) {
    return this.normalizeEntries(entries);
  }

  publish(matchId: string, type: string, entityId: string) {
    return this.afterRosterMutation(matchId, type, entityId);
  }
}

describe('SportsMatchRosterSupportService', () => {
  const mutationEvents = { publishRosterMutation: jest.fn() };
  const service = new TestRosterSupport({} as never, {} as never, {} as never, mutationEvents as never);

  beforeEach(() => {
    jest.clearAllMocks();
    mutationEvents.publishRosterMutation.mockResolvedValue(undefined);
  });

  it('normalizes identifiers and optional shirt numbers without changing role metadata', () => {
    const roleMetadata = { position: 'GOALKEEPER' };

    expect(
      service.normalize([
        {
          registrationMemberId: ' member-1 ',
          role: SportsRosterRole.PLAYER,
          shirtNumber: ' 10 ',
          roleMetadata,
        },
        { registrationMemberId: 'member-2', role: SportsRosterRole.COACH, shirtNumber: ' ' },
      ]),
    ).toEqual([
      { registrationMemberId: 'member-1', role: SportsRosterRole.PLAYER, shirtNumber: '10', roleMetadata },
      {
        registrationMemberId: 'member-2',
        role: SportsRosterRole.COACH,
        shirtNumber: null,
        roleMetadata: undefined,
      },
    ]);
  });

  it.each([
    {
      entries: [{ registrationMemberId: ' ', role: SportsRosterRole.PLAYER }],
      message: 'Integrante inválido na escalação.',
    },
    {
      entries: [
        { registrationMemberId: 'member-1', role: SportsRosterRole.PLAYER },
        { registrationMemberId: ' member-1 ', role: SportsRosterRole.COACH },
      ],
      message: 'Uma pessoa não pode aparecer duas vezes na mesma escalação.',
    },
    {
      entries: [{ registrationMemberId: 'member-1', role: SportsRosterRole.PLAYER, shirtNumber: '1234567890123' }],
      message: 'O número de camisa deve ter até 12 letras ou números.',
    },
    {
      entries: [{ registrationMemberId: 'member-1', role: SportsRosterRole.PLAYER, shirtNumber: '10!' }],
      message: 'O número de camisa deve ter até 12 letras ou números.',
    },
    {
      entries: [
        { registrationMemberId: 'member-1', role: SportsRosterRole.PLAYER, shirtNumber: 'A' },
        { registrationMemberId: 'member-2', role: SportsRosterRole.PLAYER, shirtNumber: 'a' },
      ],
      message: 'O número de camisa não pode se repetir na mesma escalação.',
    },
  ])('rejects invalid roster entries', ({ entries, message }) => {
    expect(() => service.normalize(entries)).toThrow(BadRequestException);
    expect(() => service.normalize(entries)).toThrow(message);
  });

  it('allows duplicate shirt numbers for non-player roles', () => {
    expect(
      service.normalize([
        { registrationMemberId: 'member-1', role: SportsRosterRole.COACH, shirtNumber: 'A' },
        { registrationMemberId: 'member-2', role: SportsRosterRole.CAPTAIN, shirtNumber: 'a' },
      ]),
    ).toHaveLength(2);
  });

  it('publishes roster mutations through the shared event boundary', async () => {
    await service.publish('match-1', 'ROSTER_APPROVED', 'roster-1');

    expect(mutationEvents.publishRosterMutation).toHaveBeenCalledWith('match-1', 'ROSTER_APPROVED', 'roster-1');
  });

  it('keeps the committed roster successful when publication fails', async () => {
    mutationEvents.publishRosterMutation.mockRejectedValueOnce(new Error('broker unavailable'));

    await expect(service.publish('match-1', 'ROSTER_APPROVED', 'roster-1')).resolves.toBeUndefined();
  });
});
