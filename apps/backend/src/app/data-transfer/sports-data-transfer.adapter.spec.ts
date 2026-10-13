import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { ResolvedTransferDocument, TransferResource } from '@cacic-fct/shared-data-transfer';
import { SportsDataTransferAdapter } from './sports-data-transfer.adapter';
import { assertSportsTimerRules } from './sports-transfer-rules';

describe('SportsDataTransferAdapter', () => {
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
