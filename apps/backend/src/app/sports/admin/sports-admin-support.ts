import { BadRequestException } from '@nestjs/common';
import { getDefaultSportsEmoji } from '@cacic-fct/shared-data-types';
import {
  Prisma,
  SportsAthleteIdentifierMode,
  SportsCategoryStatus,
  SportsFormat,
  SportsLivestreamProvider,
  SportsOfficialRole,
  SportsPreset,
  SportsRegistrationStatus,
  SportsScoringMode,
  SportsScoreEntrySource,
  SportsTeamStatus,
  SportsTournamentStatus,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { CreateSportsCategoryInput } from '../sports-admin.types';

export abstract class SportsAdminSupport {
  protected validateRosterLimits(input: CreateSportsCategoryInput): void {
    for (const [label, value] of [
      ['mínimo do elenco', input.minimumRosterSize],
      ['máximo do elenco', input.maximumRosterSize],
      ['máximo de capitães', input.maximumCaptains],
      ['máximo de técnicos', input.maximumCoaches],
      ['máximo de períodos', input.maximumPeriods],
    ] as const) {
      if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
        throw new BadRequestException(`${label} deve ser um número inteiro não negativo.`);
      }
    }
    if (
      input.minimumRosterSize !== null &&
      input.minimumRosterSize !== undefined &&
      input.maximumRosterSize !== null &&
      input.maximumRosterSize !== undefined &&
      input.minimumRosterSize > input.maximumRosterSize
    ) {
      throw new BadRequestException('O mínimo do elenco não pode superar o máximo.');
    }
    if (input.sport === SportsPreset.OTHER && !input.customSportName?.trim()) {
      throw new BadRequestException('Informe o nome do esporte personalizado.');
    }
  }

  protected buildMatchName(categoryName: string, home?: string, away?: string): string {
    return `${home ?? 'A definir'} × ${away ?? 'A definir'} - ${categoryName}`;
  }

  protected defaultSportEmoji(sport: SportsPreset): string {
    return getDefaultSportsEmoji(sport);
  }

  protected assertDateRange(startDate: Date, endDate: Date, label: string): void {
    if (!(startDate instanceof Date) || !(endDate instanceof Date) || endDate <= startDate) {
      throw new BadRequestException(`O fim do ${label} precisa ser posterior ao início.`);
    }
  }

  protected assertOptionalDateRange(
    startDate: Date | null | undefined,
    endDate: Date | null | undefined,
    label: string,
  ): void {
    if ((startDate && !endDate) || (!startDate && endDate)) {
      throw new BadRequestException(`Informe o início e o fim de ${label}.`);
    }
    if (startDate && endDate) {
      this.assertDateRange(startDate, endDate, label);
    }
  }

  protected requireText(value: string, label: string, minimum: number, maximum: number): string {
    const normalized = value.trim();
    if (normalized.length < minimum || normalized.length > maximum) {
      throw new BadRequestException(`${label} deve ter entre ${minimum} e ${maximum} caracteres.`);
    }
    return normalized;
  }

  protected optionalText(value: string | null | undefined, label: string, maximum: number): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      return null;
    }
    if (normalized.length > maximum) {
      throw new BadRequestException(`${label} deve ter no máximo ${maximum} caracteres.`);
    }
    return normalized;
  }

  protected normalizeLivestreamUrl(
    provider: SportsLivestreamProvider | null | undefined,
    value: string | null | undefined,
  ): string | null {
    const normalized = value?.trim() ?? '';
    if (!normalized) {
      if (provider) {
        throw new BadRequestException('Informe a URL da transmissão ao selecionar um provedor.');
      }
      return null;
    }
    let url: URL;
    try {
      url = new URL(normalized);
    } catch {
      throw new BadRequestException('Informe uma URL de transmissão válida.');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('A transmissão deve utilizar uma URL HTTPS.');
    }
    const hostname = url.hostname.toLocaleLowerCase('en-US');
    if (
      provider === SportsLivestreamProvider.YOUTUBE &&
      hostname !== 'youtu.be' &&
      !hostname.endsWith('.youtube.com') &&
      hostname !== 'youtube.com'
    ) {
      throw new BadRequestException('Informe uma URL válida do YouTube.');
    }
    if (provider === SportsLivestreamProvider.TWITCH && hostname !== 'twitch.tv' && !hostname.endsWith('.twitch.tv')) {
      throw new BadRequestException('Informe uma URL válida da Twitch.');
    }
    return url.toString();
  }

  protected youtubeCodeForLivestream(
    provider: SportsLivestreamProvider | null | undefined,
    value: string | null | undefined,
  ): string | null {
    if (provider !== SportsLivestreamProvider.YOUTUBE || !value?.trim()) {
      return null;
    }
    const url = new URL(this.normalizeLivestreamUrl(provider, value) as string);
    if (url.hostname.toLocaleLowerCase('en-US') === 'youtu.be') {
      return url.pathname.split('/').filter(Boolean)[0] ?? null;
    }
    return url.searchParams.get('v') ?? url.pathname.match(/\/(?:live|embed|shorts)\/([^/?#]+)/)?.[1] ?? null;
  }

  protected requireDate(value: Date | undefined, label: string): Date {
    if (!(value instanceof Date)) {
      throw new BadRequestException(`Informe ${label}.`);
    }
    return value;
  }

  protected requireActorId(actor: AuthenticatedUser): string {
    if (!actor.sub) {
      throw new BadRequestException('O usuário autenticado não possui identificador.');
    }
    return actor.sub;
  }

  protected readRevisionMap(value: Prisma.JsonValue): Record<string, number> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isInteger(entry[1]),
      ),
    );
  }

  protected tournamentAuditSnapshot(tournament: {
    id: string;
    majorEventId: string;
    status: SportsTournamentStatus;
    scoringMode: SportsScoringMode;
    selfSubscriptionEnabled: boolean;
    selfSubscriptionAllowNoTeam: boolean;
    selfSubscriptionAllowNoCategory: boolean;
    allowPlayerMultipleTeams: boolean;
    revision: number;
  }) {
    return {
      id: tournament.id,
      majorEventId: tournament.majorEventId,
      status: tournament.status,
      scoringMode: tournament.scoringMode,
      selfSubscriptionEnabled: tournament.selfSubscriptionEnabled,
      selfSubscriptionAllowNoTeam: tournament.selfSubscriptionAllowNoTeam,
      selfSubscriptionAllowNoCategory: tournament.selfSubscriptionAllowNoCategory,
      allowPlayerMultipleTeams: tournament.allowPlayerMultipleTeams,
      revision: tournament.revision,
    };
  }

  protected categoryAuditSnapshot(category: {
    id: string;
    tournamentId: string;
    eventGroupId: string;
    name: string;
    sport: SportsPreset;
    division: string | null;
    format: SportsFormat;
    status: SportsCategoryStatus;
    athleteIdentifierMode: SportsAthleteIdentifierMode;
    joiningInstructions: string | null;
    revision: number;
  }) {
    return {
      id: category.id,
      tournamentId: category.tournamentId,
      eventGroupId: category.eventGroupId,
      name: category.name,
      sport: category.sport,
      division: category.division,
      format: category.format,
      status: category.status,
      athleteIdentifierMode: category.athleteIdentifierMode,
      joiningInstructions: category.joiningInstructions,
      revision: category.revision,
    };
  }

  protected teamAuditSnapshot(team: {
    id: string;
    tournamentId: string;
    name: string;
    institution: string | null;
    status: SportsTeamStatus;
    revision: number;
  }) {
    return {
      id: team.id,
      tournamentId: team.tournamentId,
      name: team.name,
      institution: team.institution,
      status: team.status,
      revision: team.revision,
    };
  }

  protected registrationAuditSnapshot(registration: {
    id: string;
    teamId: string;
    categoryId: string;
    status: SportsRegistrationStatus;
    seed: number | null;
    revision: number;
  }) {
    return {
      id: registration.id,
      teamId: registration.teamId,
      categoryId: registration.categoryId,
      status: registration.status,
      seed: registration.seed,
      revision: registration.revision,
    };
  }

  protected officialAuditSnapshot(assignment: {
    id: string;
    tournamentId: string;
    categoryId: string | null;
    matchId: string | null;
    personId: string;
    role: SportsOfficialRole;
    active: boolean;
    revision: number;
  }) {
    return {
      id: assignment.id,
      tournamentId: assignment.tournamentId,
      categoryId: assignment.categoryId,
      matchId: assignment.matchId,
      personId: assignment.personId,
      role: assignment.role,
      active: assignment.active,
      revision: assignment.revision,
    };
  }

  protected scoreEntryAuditSnapshot(entry: {
    id: string;
    tournamentId: string;
    categoryId: string | null;
    teamId: string;
    sourceMatchId: string | null;
    source: SportsScoreEntrySource;
    points: number;
    reason: string;
    revision: number;
  }) {
    return {
      id: entry.id,
      tournamentId: entry.tournamentId,
      categoryId: entry.categoryId,
      teamId: entry.teamId,
      sourceMatchId: entry.sourceMatchId,
      source: entry.source,
      points: entry.points,
      reason: entry.reason,
      revision: entry.revision,
    };
  }

  protected matchAuditSnapshot(match: {
    id: string;
    eventId: string;
    categoryId: string;
    state: string;
    reviewStatus: string;
    revision: number;
  }) {
    return {
      id: match.id,
      eventId: match.eventId,
      categoryId: match.categoryId,
      state: match.state,
      reviewStatus: match.reviewStatus,
      revision: match.revision,
    };
  }
}
