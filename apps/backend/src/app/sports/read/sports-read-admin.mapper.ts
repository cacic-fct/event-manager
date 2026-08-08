import {
  SportsCategory,
  SportsCategoryPlacement,
  SportsMatch,
  SportsMatchAction,
  SportsMatchRoster,
  SportsMatchRosterEntry,
  SportsOfficialAssignment,
  SportsRegistration,
  SportsScoreboard,
  SportsStage,
  SportsStanding,
  SportsTeam,
  SportsTeamChangeRequest,
  SportsTournament,
  SportsTournamentScoreEntry,
} from '@cacic-fct/shared-data-types';
import { Prisma } from '@prisma/client';
import { normalizeSportsScoreboard } from '../domain/sports-scoreboard';
import { toSportsPublicPlayerName } from '../domain/sports-public-name';
import {
  AdminSportsRegistrationMemberSummary,
  AdminSportsTeamMemberSummary,
  AdminSportsTeamRepresentativeSummary,
} from './sports-read.models';

import {
  AdminCategoryRecord,
  AdminRegistrationRecord,
  AdminTeamRecord,
  AdminTournamentRecord,
} from './sports-read.records';

export class SportsReadAdminMapper {
  mapAdminTournament(record: AdminTournamentRecord): SportsTournament {
    return record;
  }

  mapAdminCategory(record: AdminCategoryRecord): SportsCategory {
    return {
      ...record,
      emoji: record.eventGroup.emoji || '🏅',
      scoreRulesJson: this.serializeJson(record.scoreRules),
      timerRulesJson: this.serializeJson(record.timerRules),
      rosterRulesJson: this.serializeJson(record.rosterRules),
      bracketRulesJson: this.serializeJson(record.bracketRules),
      standingsRulesJson: this.serializeJson(record.standingsRules),
    };
  }

  mapAdminTeam(record: AdminTeamRecord): SportsTeam {
    return {
      ...record,
      logoUrl: record.logoSha256 ? `/api/sports/admin/teams/${record.id}/logo/${record.logoSha256}` : null,
      fieldRevisionsJson: this.serializeJson(record.fieldRevisions),
    };
  }

  mapAdminRegistration(record: AdminRegistrationRecord): SportsRegistration {
    return {
      ...record,
      formAnswersJson: record.formAnswers === null ? null : this.serializeJson(record.formAnswers),
      formSchemaSnapshotJson: record.formSchemaSnapshot === null ? null : this.serializeJson(record.formSchemaSnapshot),
    };
  }

  mapAdminStage(record: Prisma.SportsStageGetPayload<object>): SportsStage {
    return {
      ...record,
      settingsJson: this.serializeJson(record.settings),
    };
  }

  mapAdminMatch(record: Prisma.SportsMatchGetPayload<{ include: { event: true } }>): SportsMatch {
    return {
      ...record,
      scoreboard: this.mapAdminScoreboard(record.scoreboard),
      canonicalScoreboard: this.mapAdminScoreboard(record.canonicalScoreboard),
      occurrencesJson: this.serializeJson(record.occurrences),
      timerStartedAtUnixMs: record.timerStartedAt?.getTime() ?? null,
      timerPausedAtUnixMs: record.timerPausedAt?.getTime() ?? null,
      periodTimers: [],
      overallTimerEnabled: true,
      periodTimerEnabled: true,
    };
  }

  mapAdminScoreboard(value: Prisma.JsonValue): SportsScoreboard {
    try {
      const scoreboard = normalizeSportsScoreboard(value);
      return {
        homeScore: scoreboard.home,
        awayScore: scoreboard.away,
        activePeriod: scoreboard.activePeriodNumber,
        periods: scoreboard.periods.map((period) => ({
          number: period.number,
          label: period.label,
          homeScore: period.home,
          awayScore: period.away,
          completed: period.closed,
        })),
        metadataJson: null,
      };
    } catch {
      return {
        homeScore: 0,
        awayScore: 0,
        activePeriod: null,
        periods: [],
        metadataJson: this.serializeJson({ invalidScoreboard: value }),
      };
    }
  }

  mapAdminStanding(record: Prisma.SportsStandingGetPayload<object>): SportsStanding {
    return {
      ...record,
      tiebreakDataJson: this.serializeJson(record.tiebreakData),
    };
  }

  mapAdminPlacement(record: Prisma.SportsCategoryPlacementGetPayload<object>): SportsCategoryPlacement {
    return record;
  }

  mapAdminTeamMember(
    record: Prisma.SportsTeamMemberGetPayload<{
      select: {
        id: true;
        teamId: true;
        participantId: true;
        status: true;
        revision: true;
        participant: {
          select: { person: { select: { id: true; name: true } } };
        };
      };
    }>,
  ): AdminSportsTeamMemberSummary {
    return {
      id: record.id,
      teamId: record.teamId,
      participantId: record.participantId,
      status: record.status,
      revision: record.revision,
      person: {
        id: record.participant.person.id,
        name: toSportsPublicPlayerName(record.participant.person.name),
      },
    };
  }

  mapAdminRepresentative(
    record: Prisma.SportsTeamRepresentativeGetPayload<{
      select: {
        id: true;
        teamId: true;
        personId: true;
        person: { select: { id: true; name: true } };
        active: true;
        assignedAt: true;
        revokedAt: true;
      };
    }>,
  ): AdminSportsTeamRepresentativeSummary {
    return {
      ...record,
      person: {
        id: record.person.id,
        name: toSportsPublicPlayerName(record.person.name),
      },
    };
  }

  mapAdminChangeRequest(
    record: Prisma.SportsTeamChangeRequestGetPayload<{ include: { identityClaims: true } }>,
  ): SportsTeamChangeRequest {
    return {
      ...record,
      baseFieldRevisionsJson: this.serializeJson(record.baseFieldRevisions),
      deltaJson: this.serializeJson(record.delta),
      resolvedDeltaJson: record.resolvedDelta === null ? null : this.serializeJson(record.resolvedDelta),
    };
  }

  mapAdminRegistrationMember(
    record: Prisma.SportsRegistrationMemberGetPayload<{
      include: {
        teamMember: {
          select: {
            participant: {
              select: { person: { select: { id: true; name: true } } };
            };
          };
        };
      };
    }>,
  ): AdminSportsRegistrationMemberSummary {
    return {
      id: record.id,
      registrationId: record.registrationId,
      categoryId: record.categoryId,
      teamMemberId: record.teamMemberId,
      role: record.role,
      eligibility: record.eligibility,
      person: {
        id: record.teamMember.participant.person.id,
        name: toSportsPublicPlayerName(record.teamMember.participant.person.name),
      },
    };
  }

  mapAdminRoster(record: Prisma.SportsMatchRosterGetPayload<{ include: { entries: true } }>): SportsMatchRoster {
    return {
      ...record,
      entries: record.entries.map(
        (entry): SportsMatchRosterEntry => ({
          ...entry,
          roleMetadataJson: entry.roleMetadata === null ? null : this.serializeJson(entry.roleMetadata),
        }),
      ),
    };
  }

  mapAdminAction(record: Prisma.SportsMatchActionGetPayload<object>): SportsMatchAction {
    return {
      ...record,
      payloadJson: this.serializeJson(record.payload),
    };
  }

  mapAdminOfficial(
    record: Prisma.SportsOfficialAssignmentGetPayload<{ include: { person: true } }>,
  ): SportsOfficialAssignment {
    return record;
  }

  mapAdminScoreEntry(record: Prisma.SportsTournamentScoreEntryGetPayload<object>): SportsTournamentScoreEntry {
    return record;
  }

  serializeJson(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
    return JSON.stringify(value);
  }

  censorIdentityDocument(value: string | null): string | null {
    const digits = value?.replace(/\D/g, '') ?? '';
    if (!digits) {
      return null;
    }
    return `•••••••${digits.slice(-4)}`;
  }
}
