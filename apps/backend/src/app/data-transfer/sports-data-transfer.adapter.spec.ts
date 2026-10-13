import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  parseTransferDocument,
  type ResolvedTransferDocument,
  type TransferResource,
} from '@cacic-fct/shared-data-transfer';
import { SportsDataTransferAdapter } from './sports-data-transfer.adapter';
import { assertSportsTimerRules } from './sports-transfer-rules';
import { Permission } from '@cacic-fct/shared-permissions';

describe('SportsDataTransferAdapter', () => {
  it('serializes a persisted match revision accepted by the public document schema', async () => {
    const now = new Date();
    const match = {
      id: 'match-1',
      eventId: 'event-1',
      categoryId: 'category-1',
      stageId: null,
      venueId: null,
      notes: null,
      livestreamProvider: null,
      livestreamUrl: null,
      roundNumber: null,
      bracketPosition: null,
      groupKey: null,
      revision: 2,
      updatedAt: now,
      event: {
        name: 'Partida',
        emoji: '⚽',
        startDate: now,
        endDate: new Date(now.getTime() + 3600000),
        updatedAt: now,
      },
    };
    const tx = { sportsMatch: { findUniqueOrThrow: jest.fn().mockResolvedValue(match) } };
    const source = { kind: 'sports-match', id: match.id, data: {} } as TransferResource;
    const transfer = new SportsDataTransferAdapter({} as never, {} as never, {} as never, {} as never, {} as never);
    const resource = await transfer.readAppliedResource(
      {
        resource: source,
        current: source,
        revision: '2',
        scope: {},
        dependencies: [],
      },
      { ...context([source]), tx: tx as never },
    );
    expect(parseTransferDocument(document([resource])).resources[0].revision).toBe(now.toISOString());
  });

  it('previews and authorizes certificate cascades before updating sports backing events', async () => {
    const now = new Date();
    const group = { id: 'group-1', name: 'Jogos — Futsal', emoji: '⚽', updatedAt: now };
    const tournament = {
      id: 'tournament-1',
      majorEventId: 'major-1',
      shouldIssueCertificate: true,
      majorEvent: { name: 'Jogos' },
    };
    const tx = {
      sportsCategory: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'category-1',
          tournamentId: tournament.id,
          eventGroupId: group.id,
          eventGroup: group,
          tournament,
          revision: 1,
          updatedAt: now,
          timerRules: {},
          scoreRules: {},
          overallScoringRules: {},
          rosterRules: {},
          bracketRules: {},
          standingsRules: {},
        }),
      },
      sportsTournament: { findFirst: jest.fn().mockResolvedValue(tournament) },
      eventGroup: { findFirst: jest.fn().mockResolvedValue({ ...group, majorEventId: 'major-1' }) },
      event: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'event-1',
            name: 'Final',
            updatedAt: now,
            shouldIssueCertificate: true,
            shouldIssueCertificateForNonPayingAttendees: true,
            shouldIssueCertificateForNonSubscribedAttendees: true,
          },
        ]),
      },
    };
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const frozen = { assertEventMutable: jest.fn().mockResolvedValue(undefined) };
    const transfer = new SportsDataTransferAdapter(
      tx as never,
      authorization as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const category = {
      kind: 'sports-category',
      id: 'category-1',
      data: { eventGroupId: group.id },
    } as TransferResource;
    const backingGroup = {
      kind: 'group',
      id: group.id,
      data: { shouldIssueCertificateForNonPayingAttendees: false },
    } as TransferResource;
    const ctx = { ...context([category, backingGroup]), tx: tx as never, frozenResources: frozen as never };
    const snapshot = await transfer.resolve(category, ctx);
    expect(snapshot.additionalChanges).toContainEqual({
      field: 'Certificados da partida: Final',
      before: { shouldIssueCertificateForNonPayingAttendees: true },
      after: { shouldIssueCertificateForNonPayingAttendees: false },
    });
    expect(snapshot.relatedRevisions).toContainEqual({ kind: 'event', id: 'event-1', revision: now.toISOString() });
    expect(authorization.assertPermissions).toHaveBeenCalledWith(
      ctx.actor,
      [Permission.Event.Read, Permission.Event.Update],
      { eventId: 'event-1' },
    );
    authorization.assertPermissions.mockImplementation(async (_actor, permissions: Permission[]) => {
      if (permissions.includes(Permission.Event.Update)) throw new ForbiddenException();
    });
    await expect(transfer.resolve(category, ctx)).rejects.toThrow(ForbiddenException);
  });
  it.each([
    [Permission.Event.Update, Permission.Event.Create, true],
    [Permission.Event.Create, Permission.Event.Update, false],
  ])('requires event update permission for match updates with grant %s', async (granted, denied, allowed) => {
    const assertPermissions = jest.fn(async (_actor, permissions: Permission[]) => {
      if (permissions.includes(denied)) throw new ForbiddenException();
    });
    const scopedAdapter = new SportsDataTransferAdapter(
      {} as never,
      { assertPermissions } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const resource = { kind: 'sports-match', id: 'match-1', data: { name: 'Nova partida' } } as TransferResource;
    const result = scopedAdapter.assertWrite(
      {
        resource,
        current: resource,
        revision: null,
        scope: { eventId: 'event-1' },
        dependencies: [],
      },
      'update',
      context([resource]),
    );
    if (allowed) await expect(result).resolves.toBeUndefined();
    else await expect(result).rejects.toThrow(ForbiddenException);
    expect(assertPermissions).toHaveBeenCalledWith(expect.anything(), [Permission.Event.Update], {
      eventId: 'event-1',
    });
  });

  const adapter = new SportsDataTransferAdapter({} as never, {} as never, {} as never, {} as never, {} as never);

  function document(resources: TransferResource[]): ResolvedTransferDocument {
    return {
      $schema: 'urn:cacic:event-data:v1',
      format: 'cacic-event-data',
      version: 1,
      resources,
    } as ResolvedTransferDocument;
  }

  function context(
    resources: TransferResource[],
    requestedScope?: { kind: 'major-event' | 'group' | 'event'; id: string },
  ) {
    return {
      tx: {} as never,
      actor: {} as never,
      document: document(resources),
      requestedScope,
      frozenResources: {} as never,
    };
  }

  function exportGraph() {
    const now = new Date();
    const startDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    const tournament = {
      id: 'tournament-1',
      majorEventId: 'major-1',
      registrationStartDate: null,
      registrationEndDate: null,
      scoringMode: 'PER_SPORT',
      selfSubscriptionEnabled: false,
      selfSubscriptionAllowNoTeam: false,
      selfSubscriptionAllowNoCategory: false,
      allowPlayerMultipleTeams: false,
      shouldIssueCertificate: false,
      revision: 1,
      updatedAt: now,
    };
    const group = {
      id: 'group-1',
      name: 'Futsal',
      emoji: '⚽',
      majorEventId: 'major-1',
      audience: 'PUBLIC',
      audienceCourseCodes: [],
      interestEnabled: false,
      requiresImageLicenseAgreement: false,
      attendanceEligibility: null,
      shouldIssueCertificate: false,
      shouldIssueCertificateForNonPayingAttendees: false,
      shouldIssueCertificateForNonSubscribedAttendees: false,
      shouldIssueCertificateForEachEvent: false,
      shouldIssuePartialCertificate: false,
      updatedAt: now,
    };
    const category = {
      id: 'category-1',
      tournamentId: tournament.id,
      eventGroupId: group.id,
      name: 'Futsal',
      sport: 'FUTSAL',
      customSportName: null,
      division: null,
      format: 'ROUND_ROBIN',
      registrationStartDate: null,
      registrationEndDate: null,
      minimumRosterSize: null,
      maximumRosterSize: null,
      maximumCaptains: null,
      maximumCoaches: null,
      allowPlayerMultipleTeams: null,
      shouldIssueCertificate: null,
      athleteIdentifierMode: 'SHIRT_NUMBER',
      joiningInstructions: null,
      periodsEnabled: false,
      maximumPeriods: null,
      periodLabel: null,
      timerRules: { periodDurationMs: 20 * 60 * 1000 },
      scoreRules: { strategy: 'TOTAL' },
      overallScoringRules: {},
      rosterRules: {},
      bracketRules: {},
      standingsRules: {},
      rulesText: null,
      registrationFormId: null,
      revision: 1,
      updatedAt: now,
      eventGroup: group,
      tournament: { ...tournament, majorEvent: { id: 'major-1', name: 'University games' } },
    };
    const stage = {
      id: 'stage-1',
      categoryId: category.id,
      name: 'Group stage',
      type: 'GROUP',
      displayOrder: 0,
      settings: { groups: 1 },
      updatedAt: now,
    };
    const placePreset = {
      id: 'place-1',
      name: 'Sports hall',
      latitude: null,
      longitude: null,
      locationDescription: null,
      updatedAt: now,
    };
    const venue = {
      id: 'venue-1',
      tournamentId: tournament.id,
      placePresetId: placePreset.id,
      parentVenueId: null,
      name: 'Court 1',
      courtLabel: null,
      capacity: null,
      notes: null,
      revision: 1,
      updatedAt: now,
      tournament: { ...tournament, majorEvent: { id: 'major-1', name: 'University games' } },
      placePreset,
    };
    const event = {
      id: 'event-1',
      name: 'Final',
      emoji: '⚽',
      startDate,
      endDate,
      majorEventId: 'major-1',
      eventGroupId: group.id,
      updatedAt: now,
    };
    const match = {
      id: 'match-1',
      eventId: event.id,
      categoryId: category.id,
      stageId: stage.id,
      venueId: venue.id,
      notes: null,
      livestreamProvider: null,
      livestreamUrl: null,
      roundNumber: 1,
      bracketPosition: 1,
      groupKey: 'A',
      revision: 4,
      updatedAt: now,
      state: 'FINISHED',
      canonicalState: 'FINISHED',
      scoreboard: { home: 3, away: 1 },
      canonicalScoreboard: { home: 3, away: 1 },
      winnerRegistrationId: 'winner-secret-id',
      actions: [{ id: 'action-secret-id' }],
      event,
      category: { ...category, eventGroup: group },
      stage,
      venue,
    };
    const tx = {
      sportsCategory: { findFirst: jest.fn().mockResolvedValue(category) },
      sportsStage: { findMany: jest.fn().mockResolvedValue([stage]) },
      sportsMatch: { findMany: jest.fn().mockResolvedValue([match]) },
      sportsVenue: { findFirst: jest.fn() },
    };

    return { tx, matchId: match.id, eventId: event.id, stageId: stage.id, venueId: venue.id };
  }

  it('exports a schema-valid nested sports tree without scoreboard state or denied match identifiers', async () => {
    const graph = exportGraph();
    const authorization = { assertPermissions: jest.fn().mockResolvedValue(undefined) };
    const transfer = new SportsDataTransferAdapter(
      graph.tx as never,
      authorization as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const options = {
      includeDescendants: true,
      includeConfiguration: true,
      includeSubscriptions: false,
      includeAttendances: false,
    };
    const exported = await transfer.exportTarget({ kind: 'group', id: 'group-1' }, options, {
      ...context([]),
      tx: graph.tx as never,
    });
    const parsed = parseTransferDocument(document(exported.resources));
    const match = parsed.resources.find((resource) => resource.kind === 'sports-match');

    expect(exported.issues).toEqual([]);
    expect(parsed.resources.map(({ kind }) => kind)).toEqual(
      expect.arrayContaining([
        'sports-tournament',
        'sports-category',
        'group',
        'sports-stage',
        'sports-venue',
        'place-preset',
        'sports-match',
        'event',
      ]),
    );
    expect(match?.id).toBe(graph.matchId);
    expect(match?.data).not.toHaveProperty('state');
    expect(match?.data).not.toHaveProperty('scoreboard');
    expect(match?.data).not.toHaveProperty('canonicalScoreboard');
    expect(match?.data).not.toHaveProperty('winnerRegistrationId');
    expect(JSON.stringify(exported.resources)).not.toContain('winner-secret-id');
    expect(JSON.stringify(exported.resources)).not.toContain('action-secret-id');

    const deniedPermissions = {
      assertPermissions: jest.fn(async (_actor, permissions: Permission[]) => {
        if (permissions.includes(Permission.SportsMatch.Read)) throw new ForbiddenException();
      }),
    };
    const deniedTransfer = new SportsDataTransferAdapter(
      graph.tx as never,
      deniedPermissions as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const denied = await deniedTransfer.exportTarget({ kind: 'group', id: 'group-1' }, options, {
      ...context([]),
      tx: graph.tx as never,
    });

    expect(denied.resources.some((resource) => resource.id === graph.matchId)).toBe(false);
    expect(denied.resources.some((resource) => resource.id === graph.eventId)).toBe(false);
    expect(JSON.stringify(denied.issues)).not.toContain(graph.matchId);
    expect(JSON.stringify(denied.issues)).not.toContain(graph.eventId);
    expect(JSON.stringify(denied.issues)).not.toContain(graph.stageId);
    expect(JSON.stringify(denied.issues)).not.toContain(graph.venueId);
  });

  it('blocks a sports resource outside the selected parent scope', async () => {
    const item = {
      kind: 'sports-category',
      id: 'category-1',
      data: {},
    } as TransferResource;

    await expect(
      adapter.validate(
        {
          resource: item,
          current: null,
          revision: null,
          scope: { majorEventId: 'major-event-1', eventGroupId: 'group-1' },
          dependencies: [],
        },
        context([item], { kind: 'event', id: 'event-1' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('uses the nearest persisted tournament for writes below new sports IDs', async () => {
    const assertPermissions = jest.fn().mockResolvedValue(undefined);
    const scopedAdapter = new SportsDataTransferAdapter(
      {} as never,
      { assertPermissions } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const category = {
      kind: 'sports-category',
      id: 'new-category',
      data: { tournamentId: 'existing-tournament', eventGroupId: 'new-group' },
    } as TransferResource;
    const transferContext = context([category]);
    transferContext.tx = {
      sportsCategory: { findFirst: jest.fn().mockResolvedValue(null) },
      eventGroup: { findFirst: jest.fn().mockResolvedValue(null) },
      sportsTournament: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-tournament', majorEventId: 'existing-major' }),
      },
      majorEvent: { findFirst: jest.fn() },
    } as never;

    await scopedAdapter.assertWrite(
      {
        resource: category,
        current: null,
        revision: null,
        scope: {
          sportsCategoryId: 'new-category',
          eventGroupId: 'new-group',
          sportsTournamentId: 'existing-tournament',
          majorEventId: 'existing-major',
        },
        dependencies: [],
      },
      'create',
      transferContext,
    );

    expect(assertPermissions).toHaveBeenCalledTimes(3);
    for (const [, , authorizationScope] of assertPermissions.mock.calls) {
      expect(authorizationScope).toEqual({ sportsTournamentId: 'existing-tournament' });
    }
  });

  it('uses empty authorization context when a sports setup tree has no persisted ancestor', async () => {
    const assertPermissions = jest.fn().mockResolvedValue(undefined);
    const scopedAdapter = new SportsDataTransferAdapter(
      {} as never,
      { assertPermissions } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const tournament = {
      kind: 'sports-tournament',
      id: 'new-tournament',
      data: { majorEventId: 'new-major' },
    } as TransferResource;
    const transferContext = context([tournament]);
    transferContext.tx = {
      sportsCategory: { findFirst: jest.fn() },
      eventGroup: { findFirst: jest.fn() },
      sportsTournament: { findFirst: jest.fn().mockResolvedValue(null) },
      majorEvent: { findFirst: jest.fn().mockResolvedValue(null) },
    } as never;

    await scopedAdapter.assertRead(
      {
        resource: tournament,
        current: null,
        revision: null,
        scope: { sportsTournamentId: 'new-tournament', majorEventId: 'new-major' },
        dependencies: [{ kind: 'major-event', id: 'new-major' }],
      },
      transferContext,
    );

    expect(assertPermissions).toHaveBeenCalledTimes(3);
    for (const [, , authorizationScope] of assertPermissions.mock.calls) {
      expect(authorizationScope).toEqual({});
    }
  });

  it('keeps the complete scope for existing sports resources', async () => {
    const assertPermissions = jest.fn().mockResolvedValue(undefined);
    const scopedAdapter = new SportsDataTransferAdapter(
      {} as never,
      { assertPermissions } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const tournament = {
      kind: 'sports-tournament',
      id: 'tournament-1',
      data: { majorEventId: 'major-event-1' },
    } as TransferResource;
    const transferContext = context([tournament]);
    const existingScope = { sportsTournamentId: 'tournament-1', majorEventId: 'major-event-1' };

    await scopedAdapter.assertRead(
      {
        resource: tournament,
        current: tournament,
        revision: '2',
        scope: existingScope,
        dependencies: [],
      },
      transferContext,
    );

    expect(assertPermissions).toHaveBeenCalledTimes(3);
    for (const [, , authorizationScope] of assertPermissions.mock.calls) {
      expect(authorizationScope).toEqual(existingScope);
    }
  });

  it('rejects references to a venue in a different tournament', async () => {
    const tournament = {
      kind: 'sports-tournament',
      id: 'tournament-1',
      data: { majorEventId: 'major-event-1', shouldIssueCertificate: false },
    } as TransferResource;
    const majorEvent = {
      kind: 'major-event',
      id: 'major-event-1',
      data: { name: 'Jogos universitários' },
    } as TransferResource;
    const category = {
      kind: 'sports-category',
      id: 'category-1',
      data: { tournamentId: 'tournament-1', eventGroupId: 'group-1', name: 'Futsal', sport: 'FUTSAL' },
    } as TransferResource;
    const venue = {
      kind: 'sports-venue',
      id: 'venue-1',
      data: { tournamentId: 'tournament-2' },
    } as TransferResource;
    const match = {
      kind: 'sports-match',
      id: 'match-1',
      data: {
        categoryId: 'category-1',
        eventId: 'event-1',
        startDate: '2030-01-01T12:00:00.000Z',
        endDate: '2030-01-01T13:00:00.000Z',
        venueId: 'venue-1',
      },
    } as TransferResource;

    let result: unknown;
    try {
      await adapter.validate(
        {
          resource: match,
          current: null,
          revision: null,
          scope: { majorEventId: 'major-event-1', sportsCategoryId: 'category-1' },
          dependencies: [],
        },
        context([majorEvent, tournament, category, venue, match]),
      );
    } catch (error: unknown) {
      result = error;
    }
    expect(result).toBeInstanceOf(ConflictException);
  });

  it('rejects a match stage owned by another category', async () => {
    const majorEvent = {
      kind: 'major-event',
      id: 'major-event-1',
      data: { name: 'University games' },
    } as TransferResource;
    const tournament = {
      kind: 'sports-tournament',
      id: 'tournament-1',
      data: { majorEventId: majorEvent.id, shouldIssueCertificate: false },
    } as TransferResource;
    const category = {
      kind: 'sports-category',
      id: 'category-1',
      data: { tournamentId: tournament.id, eventGroupId: 'group-1', name: 'Futsal', sport: 'FUTSAL' },
    } as TransferResource;
    const foreignStage = {
      kind: 'sports-stage',
      id: 'stage-foreign',
      data: { categoryId: 'category-2' },
    } as TransferResource;
    const match = {
      kind: 'sports-match',
      id: 'match-1',
      data: {
        categoryId: category.id,
        eventId: 'event-1',
        stageId: foreignStage.id,
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
      },
    } as TransferResource;

    await expect(
      adapter.validate(
        {
          resource: match,
          current: null,
          revision: null,
          scope: { majorEventId: majorEvent.id, sportsCategoryId: category.id },
          dependencies: [],
        },
        context([majorEvent, tournament, category, foreignStage, match]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a stage under its category and defers its invalidation until commit', async () => {
    const createdAt = new Date();
    const stage = {
      kind: 'sports-stage',
      id: 'stage-new',
      data: { categoryId: 'category-1', name: 'Groups', type: 'GROUP', displayOrder: 0, settings: { groups: 2 } },
    } as TransferResource;
    const category = {
      id: 'category-1',
      eventGroupId: 'group-1',
      tournament: { majorEventId: 'major-1' },
    };
    const stageRow = {
      id: stage.id,
      name: 'Groups',
      type: 'GROUP',
      displayOrder: 0,
      settings: { groups: 2 },
      updatedAt: createdAt,
    };
    const tx = {
      sportsCategory: { findFirst: jest.fn().mockResolvedValue(category) },
      sportsStage: { create: jest.fn().mockResolvedValue(stageRow) },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
    const adapter = new SportsDataTransferAdapter(
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      mutationEvents as never,
    );
    const transferContext = { ...context([stage]), tx: tx as never };
    const snapshot: ResolvedTransferResource = {
      resource: stage,
      current: null,
      revision: null,
      scope: { sportsCategoryId: 'category-1', eventGroupId: 'group-1', majorEventId: 'major-1' },
      dependencies: [],
    };

    const result = await adapter.apply(snapshot, 'create', transferContext);

    expect(tx.sportsStage.create).toHaveBeenCalledWith({
      data: {
        id: 'stage-new',
        categoryId: 'category-1',
        name: 'Groups',
        type: 'GROUP',
        displayOrder: 0,
        settings: { groups: 2 },
        updatedById: undefined,
        createdById: undefined,
      },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'sports-stage:stage-new', summary: 'Etapa esportiva importada.' }),
      tx,
    );
    expect(result.revision).toBe(createdAt.toISOString());
    expect(mutationEvents.publishForEntity).not.toHaveBeenCalled();
    await result.postCommitEffects?.[0]?.();
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('CATEGORY', 'category-1', true);
  });

  it('aborts a stage update when the conditional revision write loses a race', async () => {
    const revisionDate = new Date();
    const stage = {
      kind: 'sports-stage',
      id: 'stage-1',
      data: { categoryId: 'category-1', name: 'Finals', type: 'FINAL', displayOrder: 1, settings: {} },
    } as TransferResource;
    const current = {
      kind: 'sports-stage',
      id: 'stage-1',
      data: { categoryId: 'category-1', name: 'Groups', type: 'GROUP', displayOrder: 0, settings: {} },
    } as TransferResource;
    const tx = {
      sportsStage: {
        findFirst: jest.fn().mockResolvedValue({ updatedAt: revisionDate }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUniqueOrThrow: jest.fn(),
      },
      sportsCategory: {
        findFirst: jest.fn().mockResolvedValue({ eventGroupId: 'group-1', tournament: { majorEventId: 'major-1' } }),
      },
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
    const adapter = new SportsDataTransferAdapter(
      {} as never,
      {} as never,
      {} as never,
      audit as never,
      mutationEvents as never,
    );
    const transferContext = { ...context([stage]), tx: tx as never };
    const snapshot: ResolvedTransferResource = {
      resource: stage,
      current,
      revision: revisionDate.toISOString(),
      scope: { sportsCategoryId: 'category-1' },
      dependencies: [],
    };

    await expect(adapter.apply(snapshot, 'update', transferContext)).rejects.toThrow(ConflictException);

    expect(tx.sportsStage.updateMany).toHaveBeenCalledWith({
      where: { id: 'stage-1', categoryId: 'category-1', deletedAt: null, updatedAt: revisionDate },
      data: {
        name: 'Finals',
        type: 'FINAL',
        displayOrder: 1,
        settings: {},
        updatedById: undefined,
      },
    });
    expect(tx.sportsStage.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(mutationEvents.publishForEntity).not.toHaveBeenCalled();
  });

  it('creates a match through the sports service with its backing event data', async () => {
    const matchStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const matchEnd = new Date(matchStart.getTime() + 60 * 60 * 1000);
    const event = {
      kind: 'event',
      id: 'event-1',
      data: {
        name: 'Final',
        emoji: '⚽',
        startDate: matchStart.toISOString(),
        endDate: matchEnd.toISOString(),
        eventGroupId: 'group-1',
        majorEventId: 'major-1',
      },
    } as TransferResource;
    const match = {
      kind: 'sports-match',
      id: 'match-1',
      data: { categoryId: 'category-1', eventId: 'event-1', stageId: 'stage-1', venueId: 'venue-1' },
    } as TransferResource;
    const createdAt = new Date();
    const record = { id: 'match-1', revision: 1, event: { updatedAt: createdAt } };
    const createMatch = jest.fn().mockResolvedValue(record);
    const admin = { forTransaction: jest.fn().mockReturnValue({ createMatch }) };
    const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
    const adapter = new SportsDataTransferAdapter(
      {} as never,
      {} as never,
      admin as never,
      {} as never,
      mutationEvents as never,
    );
    const transferContext = context([event, match]);
    const snapshot: ResolvedTransferResource = {
      resource: match,
      current: null,
      revision: null,
      scope: { eventId: event.id, sportsCategoryId: 'category-1' },
      dependencies: [{ kind: 'event', id: event.id }],
    };

    const result = await adapter.apply(snapshot, 'create', transferContext);

    expect(admin.forTransaction).toHaveBeenCalledWith(transferContext.tx);
    expect(createMatch).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'match-1',
        categoryId: 'category-1',
        backingEventId: 'event-1',
        forceBackingEventDraft: true,
        name: 'Final',
        startDate: matchStart,
        endDate: matchEnd,
      }),
      transferContext.actor,
    );
    expect(result.revision).toBe(`1:${createdAt.toISOString()}`);
    expect(mutationEvents.publishForEntity).not.toHaveBeenCalled();
    await result.postCommitEffects?.[0]?.();
    expect(mutationEvents.publishForEntity).toHaveBeenCalledWith('MATCH', 'match-1', true);
  });

  it('updates a match with the previewed revision and rejects a stale match before invoking the writer', async () => {
    const eventUpdatedAt = new Date();
    const matchStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const matchEnd = new Date(matchStart.getTime() + 60 * 60 * 1000);
    const current = {
      kind: 'sports-match',
      id: 'match-1',
      data: {
        categoryId: 'category-1',
        eventId: 'event-1',
        name: 'Old name',
        startDate: matchStart.toISOString(),
        endDate: matchEnd.toISOString(),
        stageId: null,
        venueId: null,
        notes: null,
        livestreamProvider: null,
        livestreamUrl: null,
        roundNumber: null,
        bracketPosition: null,
        groupKey: null,
      },
    } as TransferResource;
    const match = {
      kind: 'sports-match',
      id: 'match-1',
      data: { categoryId: 'category-1', eventId: 'event-1', name: 'New name' },
    } as TransferResource;
    const event = { kind: 'event', id: 'event-1', data: { name: 'New name' } } as TransferResource;
    const updateMatch = jest
      .fn()
      .mockResolvedValue({ id: 'match-1', revision: 6, event: { updatedAt: eventUpdatedAt } });
    const admin = { forTransaction: jest.fn().mockReturnValue({ updateMatch }) };
    const tx = {
      sportsMatch: {
        findFirst: jest.fn().mockResolvedValue({ revision: 5, event: { updatedAt: eventUpdatedAt } }),
      },
    };
    const mutationEvents = { publishForEntity: jest.fn().mockResolvedValue(undefined) };
    const adapter = new SportsDataTransferAdapter(
      {} as never,
      {} as never,
      admin as never,
      {} as never,
      mutationEvents as never,
    );
    const transferContext = { ...context([event, match]), tx: tx as never };
    const snapshot: ResolvedTransferResource = {
      resource: match,
      current,
      revision: `5:${eventUpdatedAt.toISOString()}`,
      scope: { sportsMatchId: 'match-1', sportsCategoryId: 'category-1', eventId: 'event-1' },
      dependencies: [],
    };

    const result = await adapter.apply(snapshot, 'update', transferContext);
    expect(updateMatch).toHaveBeenCalledWith(
      'match-1',
      expect.objectContaining({ expectedRevision: 5, name: 'New name' }),
      transferContext.actor,
    );
    expect(result.revision).toBe(`6:${eventUpdatedAt.toISOString()}`);

    tx.sportsMatch.findFirst.mockResolvedValueOnce({ revision: 6, event: { updatedAt: eventUpdatedAt } });
    updateMatch.mockClear();
    await expect(adapter.apply(snapshot, 'update', transferContext)).rejects.toThrow(ConflictException);
    expect(updateMatch).not.toHaveBeenCalled();
    expect(mutationEvents.publishForEntity).not.toHaveBeenCalled();
  });

  it('refuses to replace stage rules while existing matches use the stage', async () => {
    const stage = {
      kind: 'sports-stage',
      id: 'stage-1',
      data: { categoryId: 'category-1', type: 'GROUP', displayOrder: 0, settings: { groupCount: 2 } },
    } as TransferResource;
    const current = {
      kind: 'sports-stage',
      id: 'stage-1',
      data: { categoryId: 'category-1', type: 'GROUP', displayOrder: 0, settings: { groupCount: 1 } },
    } as TransferResource;
    const tx = { sportsMatch: { count: jest.fn().mockResolvedValue(3) } };
    const transferContext = { ...context([stage]), tx: tx as never };
    const snapshot: ResolvedTransferResource = {
      resource: stage,
      current,
      revision: '1',
      scope: { sportsCategoryId: 'category-1' },
      dependencies: [],
    };

    await expect(adapter.validate(snapshot, transferContext)).rejects.toThrow(
      'As regras de uma etapa com partidas existentes não podem ser substituídas.',
    );
    expect(tx.sportsMatch.count).toHaveBeenCalledWith({
      where: { stageId: 'stage-1', deletedAt: null },
    });
  });

  it('allows configuration changes only while an existing match is still scheduled', async () => {
    const matchStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const matchEnd = new Date(matchStart.getTime() + 60 * 60 * 1000);
    const match = {
      kind: 'sports-match',
      id: 'match-1',
      data: {
        categoryId: 'category-1',
        eventId: 'event-1',
        startDate: matchStart.toISOString(),
        endDate: matchEnd.toISOString(),
      },
    } as TransferResource;
    const current = {
      ...match,
      data: { ...match.data, name: 'Old name' },
    } as TransferResource;
    const tx = { sportsMatch: { findFirst: jest.fn().mockResolvedValue({ state: 'CHECK_IN' }) } };
    const transferContext = { ...context([match]), tx: tx as never };
    const snapshot: ResolvedTransferResource = {
      resource: match,
      current,
      revision: '1',
      scope: { sportsMatchId: 'match-1', sportsCategoryId: 'category-1', eventId: 'event-1' },
      dependencies: [],
    };

    await expect(adapter.validate(snapshot, transferContext)).rejects.toThrow(
      'Somente partidas agendadas podem receber alterações de configuração.',
    );
    expect(tx.sportsMatch.findFirst).toHaveBeenCalledWith({
      where: { id: 'match-1', deletedAt: null },
      select: { state: true },
    });
  });

  it('rejects operational match state fields instead of mass assigning them', async () => {
    const item = {
      kind: 'sports-match',
      id: 'match-1',
      data: { state: 'LIVE', score: { home: 2, away: 1 } },
    } as TransferResource;

    await expect(
      adapter.validate(
        {
          resource: item,
          current: null,
          revision: null,
          scope: { majorEventId: 'major-event-1', eventId: 'event-1' },
          dependencies: [],
        },
        context([item]),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown sports timer-rule properties', () => {
    expect(() => assertSportsTimerRules({ periodDurationMs: 90_000, command: 'start-match' })).toThrow(
      BadRequestException,
    );
  });
});
