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
