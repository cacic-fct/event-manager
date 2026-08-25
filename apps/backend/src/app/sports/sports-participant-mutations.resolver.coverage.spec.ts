import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Prisma, SportsMatchActionType } from '@prisma/client';
import { Permission } from '@cacic-fct/shared-permissions';
import { SportsParticipantMutationsResolver } from './sports-participant-mutations.resolver';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/auth.constants';
import { sportsTestDate } from './testing/sports-backend.fixtures';

describe('SportsParticipantMutationsResolver uncovered participant operations', () => {
  it('keeps the administrator-only operation permission metadata explicit', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        SportsParticipantMutationsResolver.prototype.commitAdminMatchActions,
      ),
    ).toEqual([Permission.SportsMatch.Operate]);
  });

  it('updates an athlete profile with the current person, exact profile fields, actor, and public invalidation', async () => {
    const harness = createHarness();
    const profile = { id: 'profile-1', registrationId: 'registration-1' };
    harness.admin.updateOwnAthleteProfile.mockResolvedValue(profile);
    const input = {
      registrationMemberId: 'member-1',
      gameNickname: 'Ada',
      gameAccountName: 'ada@example.com',
      gameAccountUrl: 'https://game.example/ada',
    };

    await expect(
      harness.resolver.updateCurrentUserAthleteProfile(input as never, harness.context as never),
    ).resolves.toBe('profile-1');

    expect(harness.currentUser.requireCurrentPerson).toHaveBeenCalledWith(harness.context);
    expect(harness.admin.updateOwnAthleteProfile).toHaveBeenCalledWith(
      'member-1',
      'person-1',
      {
        gameNickname: 'Ada',
        gameAccountName: 'ada@example.com',
        gameAccountUrl: 'https://game.example/ada',
      },
      harness.actor,
    );
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('REGISTRATION', 'registration-1', true);
  });

  it('does not publish an athlete profile mutation when the write fails', async () => {
    const harness = createHarness();
    const failure = new BadRequestException('Profile update rejected.');
    harness.admin.updateOwnAthleteProfile.mockRejectedValue(failure);

    await expect(
      harness.resolver.updateCurrentUserAthleteProfile(
        { registrationMemberId: 'member-1' } as never,
        harness.context as never,
      ),
    ).rejects.toBe(failure);
    expect(harness.mutationEvents.publishForEntity).not.toHaveBeenCalled();
  });

  it('submits team changes with parsed deltas, identity claims, representative actor, and private invalidation', async () => {
    const harness = createHarness();
    const request = { id: 'change-1' };
    harness.access.requireTeamRepresentative.mockResolvedValue({ actor: harness.representative });
    harness.teamChanges.submit.mockResolvedValue(request);
    const input = {
      teamId: 'team-1',
      type: 'UPDATE_MEMBERS',
      baseRevision: 3,
      expectedRequestRevision: 4,
      deltaJson: '{"set":{"name":"New team"}}',
      identityClaims: [
        { clientKey: 'member-1', type: 'CPF', value: '123' },
        { clientKey: 'member-2', type: 'EMAIL', value: 'member@example.com' },
      ],
    };

    await expect(harness.resolver.submitTeamChange(input as never, harness.context as never)).resolves.toBe('change-1');

    expect(harness.access.requireTeamRepresentative).toHaveBeenCalledWith(harness.context, 'team-1');
    expect(harness.teamChanges.submit).toHaveBeenCalledWith('team-1', 'person-1', {
      type: 'UPDATE_MEMBERS',
      baseRevision: 3,
      expectedRequestRevision: 4,
      delta: { set: { name: 'New team' } },
      identities: [
        { clientKey: 'member-1', type: 'CPF', value: '123' },
        { clientKey: 'member-2', type: 'EMAIL', value: 'member@example.com' },
      ],
    });
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('TEAM_CHANGE', 'change-1', false);
  });

  it('rejects malformed team-change JSON before calling the team-change service', async () => {
    const harness = createHarness();
    harness.access.requireTeamRepresentative.mockResolvedValue({ actor: harness.representative });

    await expect(
      harness.resolver.submitTeamChange(
        { teamId: 'team-1', type: 'UPDATE_MEMBERS', deltaJson: '{broken' } as never,
        harness.context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.teamChanges.submit).not.toHaveBeenCalled();
  });

  it('submits a player application with the current person and authenticated audit actor', async () => {
    const harness = createHarness();
    harness.applications.submitSelfApplication.mockResolvedValue({ id: 'application-1' });
    const input = {
      tournamentId: 'tournament-1',
      categoryChoices: [{ categoryId: 'category-1' }],
      message: 'Please review me',
    };

    await expect(harness.resolver.submitPlayerApplication(input as never, harness.context as never)).resolves.toBe(
      'application-1',
    );

    expect(harness.applications.submitSelfApplication).toHaveBeenCalledWith(input, 'person-1', harness.actor);
    expect(harness.mutationEvents.publishForEntity).toHaveBeenCalledWith('APPLICATION', 'application-1', false);
  });

  it('reviews a representative player application with team scope and review attribution', async () => {
    const harness = createHarness();
    harness.access.requireTeamRepresentative.mockResolvedValue({ actor: harness.representative });
    harness.applications.reviewByRepresentative.mockResolvedValue({ id: 'application-1' });
    const input = {
      applicationId: 'application-1',
      teamId: 'team-1',
      approved: false,
      reviewMessage: 'Please update the identifier.',
    };

    await expect(
      harness.resolver.reviewRepresentativePlayerApplication(input as never, harness.context as never),
    ).resolves.toBe('application-1');

    expect(harness.access.requireTeamRepresentative).toHaveBeenCalledWith(harness.context, 'team-1');
    expect(harness.applications.reviewByRepresentative).toHaveBeenCalledWith(
      'application-1',
      'team-1',
      false,
      harness.actor,
      'Please update the identifier.',
    );
  });

  it('propagates representative authorization failures without reviewing an application', async () => {
    const harness = createHarness();
    const failure = new ForbiddenException('Team representative access required.');
    harness.access.requireTeamRepresentative.mockRejectedValue(failure);

    await expect(
      harness.resolver.reviewRepresentativePlayerApplication(
        { applicationId: 'application-1', teamId: 'team-1', approved: true } as never,
        harness.context as never,
      ),
    ).rejects.toBe(failure);
    expect(harness.applications.reviewByRepresentative).not.toHaveBeenCalled();
  });

  it('submits a roster with default roles, JSON null semantics, parsed metadata, and a person audit actor', async () => {
    const harness = createHarness();
    harness.access.requireRosterManager.mockResolvedValue({ actor: harness.representative });
    harness.rosters.upsert.mockResolvedValue({ id: 'roster-1' });
    const input = {
      matchId: 'match-1',
      registrationId: 'registration-1',
      expectedRevision: 2,
      entries: [
        {
          registrationMemberId: 'member-1',
          role: null,
          shirtNumber: '10',
          roleMetadataJson: null,
        },
        {
          registrationMemberId: 'member-2',
          role: 'CAPTAIN',
          shirtNumber: null,
          roleMetadataJson: '{"position":"GOALKEEPER"}',
        },
      ],
    };

    await expect(harness.resolver.submitRoster(input as never, harness.context as never)).resolves.toBe('roster-1');

    expect(harness.access.requireRosterManager).toHaveBeenCalledWith(harness.context, 'registration-1');
    expect(harness.rosters.upsert).toHaveBeenCalledWith(
      {
        matchId: 'match-1',
        registrationId: 'registration-1',
        expectedRevision: 2,
        entries: [
          {
            registrationMemberId: 'member-1',
            role: 'PLAYER',
            shirtNumber: '10',
            roleMetadata: Prisma.DbNull,
          },
          {
            registrationMemberId: 'member-2',
            role: 'CAPTAIN',
            shirtNumber: null,
            roleMetadata: { position: 'GOALKEEPER' },
          },
        ],
      },
      'person-1',
      {
        id: 'person-1',
        name: 'Representative',
        email: 'rep@example.com',
        type: 'USER',
      },
      false,
    );
  });

  it('rejects malformed roster role metadata before roster persistence', async () => {
    const harness = createHarness();
    harness.access.requireRosterManager.mockResolvedValue({ actor: harness.representative });

    await expect(
      harness.resolver.submitRoster(
        {
          matchId: 'match-1',
          registrationId: 'registration-1',
          entries: [{ registrationMemberId: 'member-1', roleMetadataJson: '{broken' }],
        } as never,
        harness.context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.rosters.upsert).not.toHaveBeenCalled();
  });

  it('checks in roster entries with offline provenance, collector metadata, and operator attribution', async () => {
    const harness = createHarness();
    const operator = {
      actor: { id: 'official-person', userId: 'official-user' },
      assignment: { role: 'REFEREE' },
      kind: 'OFFICIAL',
    };
    harness.access.requireMatchOperator.mockResolvedValue(operator);
    harness.rosters.checkIn.mockResolvedValue(undefined);
    const checkedInAt = sportsTestDate();
    const input = {
      rosterEntryId: 'roster-entry-1',
      checkedInAt,
      clientId: 'device-1',
      offline: true,
      present: false,
      collectorPersonId: 'collector-person',
      collectorCredential: 'credential-1',
    };

    await expect(
      harness.resolver.checkInRosterEntry('match-1', input as never, harness.context as never),
    ).resolves.toBe(true);

    expect(harness.rosters.checkIn).toHaveBeenCalledWith(
      'match-1',
      'roster-entry-1',
      checkedInAt,
      'device-1',
      true,
      false,
      'official-person',
      'official-user',
      'REFEREE',
      {
        id: 'official-person',
        name: undefined,
        email: null,
        type: 'USER',
      },
      {
        collectorPersonId: 'collector-person',
        collectorCredential: 'credential-1',
      },
    );
  });

  it('rejects a forfeit unless the input contains exactly one FORFEIT action and a lineup manager', async () => {
    const harness = createHarness();
    await expect(
      harness.resolver.forfeitMatch({ actions: [] } as never, harness.context as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.resolver.forfeitMatch(
        {
          actions: [{ type: SportsMatchActionType.START, payloadJson: '{}', matchId: 'match-1' }],
        } as never,
        harness.context as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(harness.access.requireLineupManager).not.toHaveBeenCalled();
  });

  it('commits a valid forfeit with parsed loser registration and lineup-manager audit identity', async () => {
    const harness = createHarness();
    harness.access.requireLineupManager.mockResolvedValue({
      actor: harness.representative,
      assignment: { role: 'CAPTAIN' },
    });
    harness.operations.commit.mockResolvedValue([{ id: 'forfeit-action-1' }]);
    const action = {
      clientId: 'client-1',
      matchId: 'match-1',
      baseRevision: 7,
      type: SportsMatchActionType.FORFEIT,
      payloadJson: '{"loserRegistrationId":"registration-2","reason":"No show"}',
      authoredAt: sportsTestDate(),
    };

    await expect(harness.resolver.forfeitMatch({ actions: [action] } as never, harness.context as never)).resolves.toBe(
      'forfeit-action-1',
    );

    expect(harness.access.requireLineupManager).toHaveBeenCalledWith(harness.context, 'registration-2');
    expect(harness.operations.commit).toHaveBeenCalledWith(
      [{ ...action, payload: { loserRegistrationId: 'registration-2', reason: 'No show' } }],
      {
        personId: 'person-1',
        userId: 'user-1',
        role: 'CAPTAIN',
        kind: 'LINEUP_MANAGER',
        auditActor: {
          id: 'person-1',
          name: 'Representative',
          email: 'rep@example.com',
          type: 'USER',
        },
      },
    );
  });
});

function createHarness() {
  const actor = { sub: 'user-1' };
  const representative = { id: 'person-1', name: 'Representative', email: 'rep@example.com' };
  const context = { req: { user: actor } };
  const policy = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
  const frozen = {
    assertEventMutable: jest.fn().mockResolvedValue(undefined),
    assertMajorEventMutable: jest.fn().mockResolvedValue(undefined),
  };
  const prisma = {
    sportsTeamChangeRequest: { findUnique: jest.fn().mockResolvedValue(null) },
    sportsPlayerApplication: { findUnique: jest.fn().mockResolvedValue(null) },
    sportsMatchAction: { findUnique: jest.fn().mockResolvedValue(null) },
    sportsMatchRoster: { findUnique: jest.fn().mockResolvedValue(null) },
    sportsMatch: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const currentUser = {
    getAuthenticatedUser: jest.fn().mockReturnValue(actor),
    requireCurrentPerson: jest.fn().mockResolvedValue(representative),
  };
  const admin = { updateOwnAthleteProfile: jest.fn() };
  const access = {
    requireTeamRepresentative: jest.fn(),
    requireRosterManager: jest.fn(),
    requireMatchOperator: jest.fn(),
    requireLineupManager: jest.fn(),
  };
  const teamChanges = { submit: jest.fn() };
  const applications = {
    submitSelfApplication: jest.fn(),
    reviewByRepresentative: jest.fn(),
  };
  const rosters = {
    upsert: jest.fn(),
    checkIn: jest.fn(),
  };
  const operations = { commit: jest.fn() };
  const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
  const resolver = new SportsParticipantMutationsResolver(
    policy as never,
    frozen as never,
    prisma as never,
    currentUser as never,
    admin as never,
    access as never,
    teamChanges as never,
    applications as never,
    rosters as never,
    operations as never,
    {} as never,
    {} as never,
    mutationEvents as never,
  );

  return {
    resolver,
    actor,
    representative,
    context,
    currentUser,
    admin,
    access,
    teamChanges,
    applications,
    rosters,
    operations,
    mutationEvents,
  };
}
