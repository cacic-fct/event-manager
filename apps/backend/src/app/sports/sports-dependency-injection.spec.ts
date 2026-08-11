import { Test } from '@nestjs/testing';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { CurrentUserDefaultRedirectService } from '../current-user/default-redirect/current-user-default-redirect.service';
import { EventPostCommitEffectsService } from '../events/event-post-commit-effects.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsBracketAdvancementService } from './brackets/sports-bracket-advancement.service';
import { SportsBracketService } from './brackets/sports-bracket.service';
import { SportsDuplicationService } from './duplication/sports-duplication.service';
import { SportsTeamDuplicationService } from './duplication/sports-team-duplication.service';
import { SportsMatchOperationService } from './operations/sports-match-operation.service';
import { SportsRealtimeService } from './realtime/sports-realtime.service';
import { SportsMutationEventsService } from './realtime/sports-mutation-events.service';
import { SportsMatchRosterService } from './rosters/sports-match-roster.service';
import { SportsAutoroutingService } from './routing/sports-autorouting.service';
import { SportsStandingsService } from './scoring/sports-standings.service';
import { SportsPaymentService } from './sports-payment.service';

describe('sports service dependency injection', () => {
  it('resolves required mutation safeguards and duplication collaborators through Nest', async () => {
    const prisma = {};
    const auditLog = {};
    const frozen = {};
    const realtime = {};
    const autorouting = {};
    const defaultRedirect = {};
    const mutationEvents = {};
    const eventEffects = {};
    const rosters = {};
    const payments = {};
    const moduleRef = await Test.createTestingModule({
      providers: [
        SportsBracketAdvancementService,
        SportsBracketService,
        SportsStandingsService,
        SportsMatchOperationService,
        SportsTeamDuplicationService,
        SportsDuplicationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: auditLog },
        { provide: FrozenResourceService, useValue: frozen },
        { provide: SportsRealtimeService, useValue: realtime },
        { provide: SportsMutationEventsService, useValue: mutationEvents },
        { provide: EventPostCommitEffectsService, useValue: eventEffects },
        { provide: SportsAutoroutingService, useValue: autorouting },
        { provide: CurrentUserDefaultRedirectService, useValue: defaultRedirect },
        { provide: SportsMatchRosterService, useValue: rosters },
        { provide: SportsPaymentService, useValue: payments },
      ],
    }).compile();

    try {
      const advancement = moduleRef.get(SportsBracketAdvancementService);
      const standings = moduleRef.get(SportsStandingsService);
      const operations = moduleRef.get(SportsMatchOperationService);
      const bracket = moduleRef.get(SportsBracketService);
      const teamDuplicator = moduleRef.get(SportsTeamDuplicationService);
      const duplication = moduleRef.get(SportsDuplicationService);

      expect(dependency(advancement, 'rosters')).toBe(rosters);
      expect(dependency(standings, 'auditLog')).toBe(auditLog);
      expect(dependency(operations, 'frozen')).toBe(frozen);
      expect(dependency(operations, 'mutationEvents')).toBe(mutationEvents);
      expect(dependency(operations, 'eventEffects')).toBe(eventEffects);
      expect(dependency(bracket, 'frozen')).toBe(frozen);
      expect(dependency(bracket, 'eventEffects')).toBe(eventEffects);
      expect(dependency(teamDuplicator, 'payments')).toBe(payments);
      expect(dependency(duplication, 'teamDuplicator')).toBe(teamDuplicator);
    } finally {
      await moduleRef.close();
    }
  });

  function dependency(instance: object, key: string): unknown {
    return (instance as unknown as Record<string, unknown>)[key];
  }
});
