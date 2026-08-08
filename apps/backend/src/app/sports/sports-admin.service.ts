import { Injectable } from '@nestjs/common';
import { AuditLogService } from '../audit-log/audit-log.service';
import { FrozenResourceService } from '../common/frozen-resource.service';
import { PrismaService } from '../prisma/prisma.service';
import { SportsCategoryAdminService } from './admin/sports-category-admin.service';
import { SportsMatchAdminService } from './admin/sports-match-admin.service';
import { SportsOfficialAdminService } from './admin/sports-official-admin.service';
import { SportsRegistrationAdminService } from './admin/sports-registration-admin.service';
import { SportsScoreEntryAdminService } from './admin/sports-score-entry-admin.service';
import { SportsTeamAdminService } from './admin/sports-team-admin.service';
import { SportsTournamentAdminService } from './admin/sports-tournament-admin.service';
import { SportsVenueAdminService } from './admin/sports-venue-admin.service';
import { SportsPaymentService } from './sports-payment.service';

export * from './sports-admin.types';

@Injectable()
export class SportsAdminService {
  private readonly tournaments: SportsTournamentAdminService;
  private readonly categories: SportsCategoryAdminService;
  private readonly teams: SportsTeamAdminService;
  private readonly registrations: SportsRegistrationAdminService;
  private readonly venues: SportsVenueAdminService;
  private readonly matches: SportsMatchAdminService;
  private readonly officials: SportsOfficialAdminService;
  private readonly scoreEntries: SportsScoreEntryAdminService;

  constructor(
    prisma: PrismaService,
    frozen: FrozenResourceService,
    auditLog: AuditLogService,
    payments: SportsPaymentService,
  ) {
    const dependencies = [prisma, frozen, auditLog, payments] as const;
    this.tournaments = new SportsTournamentAdminService(...dependencies);
    this.categories = new SportsCategoryAdminService(...dependencies);
    this.teams = new SportsTeamAdminService(...dependencies);
    this.registrations = new SportsRegistrationAdminService(...dependencies);
    this.venues = new SportsVenueAdminService(...dependencies);
    this.matches = new SportsMatchAdminService(...dependencies);
    this.officials = new SportsOfficialAdminService(...dependencies);
    this.scoreEntries = new SportsScoreEntryAdminService(...dependencies);
  }

  readonly attachTournament = (...args: Parameters<SportsTournamentAdminService['attachTournament']>) =>
    this.tournaments.attachTournament(...args);
  readonly createTournament = (...args: Parameters<SportsTournamentAdminService['createTournament']>) =>
    this.tournaments.createTournament(...args);
  readonly updateTournament = (...args: Parameters<SportsTournamentAdminService['updateTournament']>) =>
    this.tournaments.updateTournament(...args);
  readonly deleteTournament = (...args: Parameters<SportsTournamentAdminService['deleteTournament']>) =>
    this.tournaments.deleteTournament(...args);

  readonly createCategory = (...args: Parameters<SportsCategoryAdminService['createCategory']>) =>
    this.categories.createCategory(...args);
  readonly updateCategory = (...args: Parameters<SportsCategoryAdminService['updateCategory']>) =>
    this.categories.updateCategory(...args);
  readonly deleteCategory = (...args: Parameters<SportsCategoryAdminService['deleteCategory']>) =>
    this.categories.deleteCategory(...args);

  readonly createTeam = (...args: Parameters<SportsTeamAdminService['createTeam']>) => this.teams.createTeam(...args);
  readonly updateTeam = (...args: Parameters<SportsTeamAdminService['updateTeam']>) => this.teams.updateTeam(...args);
  readonly createTeamMember = (...args: Parameters<SportsTeamAdminService['createTeamMember']>) =>
    this.teams.createTeamMember(...args);
  readonly updateTeamMember = (...args: Parameters<SportsTeamAdminService['updateTeamMember']>) =>
    this.teams.updateTeamMember(...args);
  readonly assignRepresentative = (...args: Parameters<SportsTeamAdminService['assignRepresentative']>) =>
    this.teams.assignRepresentative(...args);
  readonly revokeRepresentative = (...args: Parameters<SportsTeamAdminService['revokeRepresentative']>) =>
    this.teams.revokeRepresentative(...args);
  readonly deleteTeam = (...args: Parameters<SportsTeamAdminService['deleteTeam']>) => this.teams.deleteTeam(...args);

  readonly createRegistration = (...args: Parameters<SportsRegistrationAdminService['createRegistration']>) =>
    this.registrations.createRegistration(...args);
  readonly updateRegistration = (...args: Parameters<SportsRegistrationAdminService['updateRegistration']>) =>
    this.registrations.updateRegistration(...args);
  readonly assignCategoryRole = (...args: Parameters<SportsRegistrationAdminService['assignCategoryRole']>) =>
    this.registrations.assignCategoryRole(...args);
  readonly deleteRegistration = (...args: Parameters<SportsRegistrationAdminService['deleteRegistration']>) =>
    this.registrations.deleteRegistration(...args);

  readonly createVenue = (...args: Parameters<SportsVenueAdminService['createVenue']>) =>
    this.venues.createVenue(...args);
  readonly updateVenue = (...args: Parameters<SportsVenueAdminService['updateVenue']>) =>
    this.venues.updateVenue(...args);
  readonly deleteVenue = (...args: Parameters<SportsVenueAdminService['deleteVenue']>) =>
    this.venues.deleteVenue(...args);

  readonly createMatch = (...args: Parameters<SportsMatchAdminService['createMatch']>) =>
    this.matches.createMatch(...args);
  readonly updateMatch = (...args: Parameters<SportsMatchAdminService['updateMatch']>) =>
    this.matches.updateMatch(...args);
  readonly getMatchEventId = (...args: Parameters<SportsMatchAdminService['getMatchEventId']>) =>
    this.matches.getMatchEventId(...args);
  readonly deleteMatch = (...args: Parameters<SportsMatchAdminService['deleteMatch']>) =>
    this.matches.deleteMatch(...args);

  readonly assignOfficial = (...args: Parameters<SportsOfficialAdminService['assignOfficial']>) =>
    this.officials.assignOfficial(...args);
  readonly updateOfficial = (...args: Parameters<SportsOfficialAdminService['updateOfficial']>) =>
    this.officials.updateOfficial(...args);
  readonly deleteOfficial = (...args: Parameters<SportsOfficialAdminService['deleteOfficial']>) =>
    this.officials.deleteOfficial(...args);

  readonly createTournamentScoreEntry = (
    ...args: Parameters<SportsScoreEntryAdminService['createTournamentScoreEntry']>
  ) => this.scoreEntries.createTournamentScoreEntry(...args);
  readonly updateTournamentScoreEntry = (
    ...args: Parameters<SportsScoreEntryAdminService['updateTournamentScoreEntry']>
  ) => this.scoreEntries.updateTournamentScoreEntry(...args);
  readonly deleteTournamentScoreEntry = (
    ...args: Parameters<SportsScoreEntryAdminService['deleteTournamentScoreEntry']>
  ) => this.scoreEntries.deleteTournamentScoreEntry(...args);
}
