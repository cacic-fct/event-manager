import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { EMPTY, Subject, of, throwError } from 'rxjs';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventFormApiService } from '../graphql/event-form-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PlacePresetApiService } from '../graphql/place-preset-api.service';
import { RealtimeApiService } from '../graphql/realtime-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SportsApiService } from './sports-api.service';
import { SportsWorkspaceService } from './sports-workspace.service';
import {
  createAdminSportsPendingMatchActions,
  createAdminSportsCategoryRead,
  createAdminSportsTeamRead,
  createAdminSportsTournamentRead,
  adminSportsRelativeDate,
} from './sports-story.fixtures';
import { toLocalDate } from './sports-workspace-form.utils';
import { flushAsync } from '../testing/async-test-helpers';

describe('SportsWorkspaceService', () => {
  let workspace: SportsWorkspaceService;
  let workspaceEvents: Subject<void>;
  let sportsApi: { tournaments: ReturnType<typeof vi.fn> };
  let majorEventApi: { listMajorEvents: ReturnType<typeof vi.fn> };
  let placePresetApi: { listPlacePresets: ReturnType<typeof vi.fn> };
  const permissions = {
    has: vi.fn((permission: string) => permission.startsWith('sports-')),
    hasAll: vi.fn(() => true),
  };

  beforeEach(() => {
    permissions.has.mockImplementation((permission: string) => permission.startsWith('sports-'));
    permissions.hasAll.mockReturnValue(true);
    workspaceEvents = new Subject<void>();
    sportsApi = { tournaments: vi.fn(() => of([])) };
    majorEventApi = { listMajorEvents: vi.fn(() => of([])) };
    placePresetApi = { listPlacePresets: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        SportsWorkspaceService,
        { provide: SportsApiService, useValue: sportsApi },
        { provide: MajorEventApiService, useValue: majorEventApi },
        { provide: EventFormApiService, useValue: {} },
        { provide: PeopleApiService, useValue: {} },
        { provide: PlacePresetApiService, useValue: placePresetApi },
        { provide: PermissionsService, useValue: permissions },
        { provide: RealtimeApiService, useValue: { watchWorkspace: vi.fn(() => workspaceEvents) } },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
      ],
    });
    workspace = TestBed.inject(SportsWorkspaceService);
  });

  it('translates operational states into concise Portuguese labels', () => {
    expect(workspace.statusLabel('AWAITING_REVIEW')).toBe('Em revisão');
    expect(workspace.statusLabel('REGISTRATION_OPEN')).toBe('Inscrições abertas');
    expect(workspace.statusLabel('PUBLISHED')).toBe('Publicado');
    expect(workspace.statusLabel('UNKNOWN_STATE')).toBe('UNKNOWN_STATE');
  });

  it('defaults tournament registration dates to the parent and seeds independent overrides on demand', () => {
    const read = createAdminSportsTournamentRead({ categoryCount: 0, teamCount: 0 });
    workspace.tournamentRead.set(read);
    workspace.tournamentForm.patchValue({
      registrationScheduleMode: 'INHERIT',
      registrationStartDate: '',
      registrationEndDate: '',
    });

    expect(workspace.inheritedRegistrationDates()).toEqual({
      startDate: read.tournament.majorEvent?.subscriptionStartDate,
      endDate: read.tournament.majorEvent?.subscriptionEndDate,
    });

    workspace.setTournamentRegistrationSchedule('CUSTOM');

    expect(workspace.tournamentForm.controls.registrationScheduleMode.value).toBe('CUSTOM');
    expect(workspace.tournamentForm.controls.registrationStartDate.value).toBe(
      toLocalDate(read.tournament.majorEvent?.subscriptionStartDate),
    );
    expect(workspace.tournamentForm.controls.registrationEndDate.value).toBe(
      toLocalDate(read.tournament.majorEvent?.subscriptionEndDate),
    );
    expect(workspace.tournamentForm.valid).toBe(true);

    workspace.setTournamentRegistrationSchedule('INHERIT');
    expect(workspace.tournamentForm.controls.registrationScheduleMode.value).toBe('INHERIT');
  });

  it('resolves teams through the selected category registration', () => {
    workspace.tournamentRead.set({
      tournament: {
        id: 'tournament-1',
        majorEventId: 'major-1',
        status: 'LIVE',
        scoringMode: 'BOTH',
        selfSubscriptionEnabled: true,
        selfSubscriptionAllowNoTeam: false,
        selfSubscriptionAllowNoCategory: false,
        allowPlayerMultipleTeams: false,
        shouldIssueCertificate: true,
        revision: 2,
      },
      categories: [],
      teams: [
        {
          id: 'team-1',
          tournamentId: 'tournament-1',
          name: 'Atlética Azul',
          status: 'ACTIVE',
          revision: 1,
          fieldRevisionsJson: '{}',
        },
      ],
      scoreEntries: [],
      venues: [],
      officials: [],
      teamSummaries: [
        {
          team: {
            id: 'team-1',
            tournamentId: 'tournament-1',
            name: 'Atlética Azul',
            status: 'ACTIVE',
            revision: 1,
            fieldRevisionsJson: '{}',
          },
          registrations: [
            {
              id: 'registration-1',
              categoryId: 'category-1',
              categoryName: 'Futsal',
              categoryEmoji: '⚽',
              status: 'ACTIVE',
            },
          ],
        },
      ],
    });
    workspace.categoryRead.set({
      category: {
        id: 'category-1',
        tournamentId: 'tournament-1',
        eventGroupId: 'group-1',
        name: 'Futsal',
        sport: 'FUTSAL',
        format: 'SINGLE_ELIMINATION',
        status: 'ACTIVE',
        athleteIdentifierMode: 'SHIRT_NUMBER',
        joiningInstructions: null,
        periodsEnabled: true,
        timerRulesJson: '{}',
        scoreRulesJson: '{}',
        overallScoringRulesJson: '{}',
        rosterRulesJson: '{}',
        bracketRulesJson: '{}',
        standingsRulesJson: '{}',
        revision: 1,
      },
      registrations: [
        {
          id: 'registration-1',
          teamId: 'team-1',
          categoryId: 'category-1',
          status: 'ACTIVE',
          revision: 1,
        },
      ],
      stages: [],
      matches: [],
      standings: [],
      placements: [],
      officials: [],
    });

    expect(workspace.teamNameForRegistration('registration-1')).toBe('Atlética Azul');
    expect(workspace.teamNameForRegistration(null)).toBe('A definir');
    expect(workspace.teamModalitiesLabel('team-1')).toBe('Futsal');
  });

  it('explains canceled matches as pending rescheduling', () => {
    expect(workspace.statusLabel('CANCELED')).toBe('Cancelado');
    expect(workspace.matchStatusLabel('CANCELED')).toBe('Cancelada, aguardando reagendamento');
  });

  it('validates score rules through the structured controls', () => {
    const control = workspace.categoryForm.controls.scorePointStep;

    control.setValue(0);
    expect(control.invalid).toBe(true);
    control.setValue(0.5);
    expect(control.valid).toBe(true);
  });

  it('applies timing presets while preserving manual configuration controls', () => {
    workspace.applyTimerPreset('BASKETBALL');

    expect(workspace.categoryForm.controls.timerPeriodDurationMinutes.value).toBe(10);
    expect(workspace.categoryForm.controls.timerPeriodStartOffsetsMinutes.value).toBe('0, 10, 20, 30');
    expect(workspace.categoryForm.controls.timerAllowOvertime.value).toBe(true);

    workspace.categoryForm.controls.timerPeriodStartOffsetsMinutes.setValue('0, valor inválido');
    expect(workspace.categoryForm.controls.timerPeriodStartOffsetsMinutes.invalid).toBe(true);
  });

  it('starts new modalities without selecting a sport preset', () => {
    workspace.newCategory();

    expect(workspace.categoryForm.getRawValue()).toMatchObject({
      sport: '',
      emoji: '🏅',
      format: 'CUSTOM',
      minimumRosterSize: 0,
      maximumRosterSize: 0,
      maximumCaptains: 0,
      maximumCoaches: 0,
      periodsEnabled: false,
      maximumPeriods: 0,
      periodLabel: 'Período',
      timerPreset: 'CUSTOM',
      timerPeriodDurationMinutes: 0,
      timerPeriodStartOffsetsMinutes: '0',
      scoreAllowDraw: true,
      scoreHigherWins: true,
      scorePointStep: 1,
    });
    expect(workspace.categoryForm.controls.sport.invalid).toBe(true);
  });

  it('refreshes the major-event index from a live invalidation and stops after destruction', async () => {
    permissions.has.mockReturnValue(true);
    const initialMajorEvent = {
      id: 'major-event-1',
      name: 'Semana inicial',
      startDate: adminSportsRelativeDate(1),
      endDate: adminSportsRelativeDate(2),
    };
    const refreshedMajorEvent = {
      ...initialMajorEvent,
      name: 'Semana atualizada',
    };
    const tournament = {
      tournament: { id: 'tournament-1', majorEventId: initialMajorEvent.id },
      majorEvent: initialMajorEvent,
    };
    let currentMajorEvents = [initialMajorEvent];
    let currentTournaments: typeof tournament[] = [];
    majorEventApi.listMajorEvents.mockImplementation(() => of(currentMajorEvents));
    sportsApi.tournaments.mockImplementation(() => of(currentTournaments));

    await workspace.initialize();
    expect(workspace.majorEventWorkspaceItems().map((item) => item.majorEvent.name)).toEqual(['Semana inicial']);

    currentMajorEvents = [refreshedMajorEvent];
    currentTournaments = [{ ...tournament, majorEvent: refreshedMajorEvent }];
    workspaceEvents.next();
    await flushAsync();

    expect(majorEventApi.listMajorEvents).toHaveBeenCalledTimes(2);
    expect(sportsApi.tournaments).toHaveBeenCalledTimes(2);
    expect(workspace.majorEventWorkspaceItems().map((item) => item.majorEvent.name)).toEqual(['Semana atualizada']);

    workspace.ngOnDestroy();
    workspaceEvents.next();
    await flushAsync();

    expect(majorEventApi.listMajorEvents).toHaveBeenCalledTimes(2);
    expect(sportsApi.tournaments).toHaveBeenCalledTimes(2);
  });

  it('applies format, roster, period, score, and timer defaults when selecting a sport', () => {
    workspace.newCategory();
    workspace.applySportPreset('BASKETBALL');

    expect(workspace.categoryForm.getRawValue()).toMatchObject({
      sport: 'BASKETBALL',
      emoji: '🏀',
      format: 'SINGLE_ELIMINATION',
      minimumRosterSize: 5,
      maximumRosterSize: 15,
      maximumCaptains: 1,
      maximumCoaches: 2,
      periodsEnabled: true,
      maximumPeriods: 4,
      periodLabel: 'Quarto',
      timerPreset: 'BASKETBALL',
      timerPeriodDurationMinutes: 10,
      timerPeriodStartOffsetsMinutes: '0, 10, 20, 30',
      timerAllowOvertime: true,
      scoreAllowDraw: false,
      scoreHigherWins: true,
      scorePointStep: 1,
    });
    expect(JSON.parse(workspace.categoryForm.controls.scoreRulesJson.value)).toEqual({
      strategy: 'TOTAL',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    });
  });

  it('uses a neutral custom timer for sports without a named timer preset', () => {
    workspace.newCategory();
    workspace.applySportPreset('SWIMMING');

    expect(workspace.categoryForm.getRawValue()).toMatchObject({
      sport: 'SWIMMING',
      emoji: '🏊',
      format: 'CUSTOM',
      periodsEnabled: false,
      maximumPeriods: 0,
      periodLabel: 'Bateria',
      timerPreset: 'CUSTOM',
      timerPeriodEnabled: false,
      timerPeriodDurationMinutes: 0,
      timerAllowOvertime: false,
      timerPeriodStartOffsetsMinutes: '0',
      scoreAllowDraw: true,
      scoreHigherWins: false,
      scorePointStep: 0.001,
    });
    expect(JSON.parse(workspace.categoryForm.controls.scoreRulesJson.value)).toMatchObject({
      strategy: 'PLACEMENT',
    });
  });

  it('uses the sport-specific bracket format and timer preset for chess', () => {
    workspace.newCategory();
    workspace.applySportPreset('CHESS');

    expect(workspace.categoryForm.getRawValue()).toMatchObject({
      sport: 'CHESS',
      format: 'SWISS',
      timerPreset: 'CHESS',
      periodsEnabled: false,
      timerPeriodEnabled: false,
      timerAllowOvertime: false,
      scoreAllowDraw: true,
      scoreHigherWins: true,
      scorePointStep: 0.5,
    });
    expect(JSON.parse(workspace.categoryForm.controls.scoreRulesJson.value)).toMatchObject({ strategy: 'TOTAL' });
  });

  it('applies the Tennis preset to an existing modality, including period name and timer', () => {
    workspace.categoryRead.set(createAdminSportsCategoryRead());
    workspace.categoryForm.patchValue({
      sport: 'SOCCER',
      emoji: '🎯',
      format: 'ROUND_ROBIN',
      minimumRosterSize: 99,
      timerPreset: 'CUSTOM',
      periodLabel: 'Tempo',
      scoreRulesJson: JSON.stringify({ strategy: 'TOTAL', allowDraw: true, higherWins: false, pointStep: 0.5 }),
      overallScoringMode: 'MATCH_RESULT_AND_FINAL_PLACEMENT',
      overallPlacementPointsJson: '{"1": 100}',
      standingsWinPoints: 7,
      standingsDrawPoints: 4,
      standingsLossPoints: 2,
      standingsByePoints: 8,
      doubleRoundRobin: true,
      bracketRulesJson: JSON.stringify({ doubleRoundRobin: true }),
    });

    workspace.applySportPreset('TENNIS');

    expect(workspace.categoryForm.getRawValue()).toMatchObject({
      sport: 'TENNIS',
      emoji: '🎾',
      format: 'SINGLE_ELIMINATION',
      minimumRosterSize: 1,
      maximumRosterSize: 6,
      maximumCaptains: 1,
      maximumCoaches: 0,
      periodsEnabled: true,
      maximumPeriods: 5,
      periodLabel: 'Set',
      timerPreset: 'TENNIS',
      timerPeriodEnabled: true,
      timerPeriodDurationMinutes: 0,
      timerAllowOvertime: true,
      timerPeriodStartOffsetsMinutes: '0',
      scoreAllowDraw: false,
      scoreHigherWins: true,
      scorePointStep: 1,
      overallScoringMode: 'NONE',
      overallMatchWinPoints: 3,
      overallMatchDrawPoints: 1,
      overallMatchLossPoints: 0,
      overallPlacementPointsJson: '{}',
      standingsWinPoints: 3,
      standingsDrawPoints: 1,
      standingsLossPoints: 0,
      standingsByePoints: 3,
      doubleRoundRobin: false,
      bracketRulesJson: '{}',
      standingsRulesJson: JSON.stringify({ winPoints: 3, drawPoints: 1, lossPoints: 0, byePoints: 3 }),
    });
    expect(workspace.categoryForm.controls.overallPlacementPoints.length).toBe(0);
    expect(JSON.parse(workspace.categoryForm.controls.scoreRulesJson.value)).toEqual({
      strategy: 'SETS',
      allowDraw: false,
      higherWins: true,
      pointStep: 1,
    });
  });

  it('tracks match-specific lineup roles and shirt numbers independently', () => {
    expect(workspace.lineupRole('registration-1', 'member-1')).toBe('PLAYER');

    workspace.updateLineupDetail('registration-1', 'member-1', 'shirtNumber', '10', 'PLAYER');
    workspace.updateLineupDetail('registration-1', 'member-1', 'role', 'CAPTAIN', 'PLAYER');

    expect(workspace.lineupShirtNumber('registration-1', 'member-1')).toBe('10');
    expect(workspace.lineupRole('registration-1', 'member-1', 'PLAYER')).toBe('CAPTAIN');
  });

  it('finds unregistered modalities where the approved team roster meets the minimum', () => {
    workspace.tournamentRead.set(createAdminSportsTournamentRead());
    workspace.teamRead.set(createAdminSportsTeamRead());

    expect(workspace.approvedTeamMemberCount()).toBe(1);
    expect(workspace.automaticTeamCategories().map((category) => category.id)).toEqual(['category-2', 'category-5']);
  });

  it('automatically registers approved athletes in every eligible modality', async () => {
    const api = TestBed.inject(SportsApiService) as unknown as {
      mutate: ReturnType<typeof vi.fn>;
      tournament: ReturnType<typeof vi.fn>;
      team: ReturnType<typeof vi.fn>;
      applicationQueue: ReturnType<typeof vi.fn>;
      matchActionReviewQueue: ReturnType<typeof vi.fn>;
      watchTournamentReview: ReturnType<typeof vi.fn>;
    };
    const tournament = createAdminSportsTournamentRead();
    const teamRead = createAdminSportsTeamRead();
    let assignmentAttempts = 0;
    api.mutate = vi.fn((name: string) => {
      if (name === 'assignSportsCategoryRole' && assignmentAttempts++ === 0) {
        return throwError(() => new Error('transient assignment failure'));
      }
      return of('registration-auto');
    });
    api.tournament = vi.fn().mockReturnValue(of(tournament));
    const recoveredTeamRead = createAdminSportsTeamRead();
    recoveredTeamRead.registrations.push({
      id: 'registration-auto',
      teamId: recoveredTeamRead.team.id,
      categoryId: 'category-2',
      status: 'APPROVED',
      seed: null,
      formAnswersJson: null,
      revision: 1,
    });
    api.team = vi.fn().mockReturnValue(of(recoveredTeamRead));
    api.applicationQueue = vi.fn().mockReturnValue(of([]));
    api.matchActionReviewQueue = vi.fn().mockReturnValue(of([]));
    api.watchTournamentReview = vi.fn().mockReturnValue(EMPTY);
    workspace.tournamentRead.set(tournament);
    workspace.teamRead.set(teamRead);

    await workspace.autoRegisterTeamInEligibleCategories();

    const registrationCalls = api.mutate.mock.calls.filter(([name]) => name === 'createSportsRegistration');
    const rosterCalls = api.mutate.mock.calls.filter(([name]) => name === 'assignSportsCategoryRole');
    expect(registrationCalls).toHaveLength(2);
    expect(rosterCalls).toHaveLength(3);
    expect(rosterCalls.map(([, , input]) => input)).toEqual([
      { registrationId: 'registration-auto', teamMemberId: 'member-1', role: 'PLAYER' },
      { registrationId: 'registration-auto', teamMemberId: 'member-1', role: 'PLAYER' },
      { registrationId: 'registration-auto', teamMemberId: 'member-1', role: 'PLAYER' },
    ]);
    expect(api.team).toHaveBeenCalledWith('team-1');
  });

  it('does not call a mutation when the current user only has read access', async () => {
    const api = TestBed.inject(SportsApiService) as unknown as {
      mutate: ReturnType<typeof vi.fn>;
    };
    api.mutate = vi.fn();
    permissions.has.mockReturnValue(false);
    workspace.tournamentRead.set(createAdminSportsTournamentRead());

    await workspace.saveTournament();

    expect(workspace.canUpdateTournament()).toBe(false);
    expect(api.mutate).not.toHaveBeenCalled();
  });

  it('reviews a pending action without a selected match', async () => {
    const api = TestBed.inject(SportsApiService) as unknown as {
      reviewMatchAction: ReturnType<typeof vi.fn>;
      matchActionReviewQueue: ReturnType<typeof vi.fn>;
    };
    api.reviewMatchAction = vi.fn().mockReturnValue(of('action-1'));
    api.matchActionReviewQueue = vi.fn().mockReturnValue(of([]));
    workspace.tournamentRead.set(createAdminSportsTournamentRead({ categoryCount: 1, teamCount: 2 }));
    workspace.pendingMatchActions.set(createAdminSportsPendingMatchActions());

    await workspace.reviewAction('action-1', 'APPROVED');

    expect(api.reviewMatchAction).toHaveBeenCalledWith({
      actionId: 'action-1',
      decision: 'APPROVED',
      reviewMessage: null,
    });
    expect(api.matchActionReviewQueue).toHaveBeenCalledWith('tournament-1');
    expect(workspace.pendingMatchActions()).toEqual([]);
  });

  it('loads a selected category and synchronizes dependent forms from shared story fixtures', async () => {
    const api = TestBed.inject(SportsApiService) as unknown as {
      category: ReturnType<typeof vi.fn>;
    };
    const read = createAdminSportsCategoryRead();
    api.category = vi.fn().mockReturnValue(of(read));

    await workspace.selectCategory(read.category);

    expect(api.category).toHaveBeenCalledWith(read.category.id);
    expect(workspace.categoryRead()).toEqual(read);
    expect(workspace.selectedCategoryId()).toBe(read.category.id);
    expect(workspace.categoryForm.controls.name.value).toBe(read.category.name);
    expect(workspace.registrationForm.controls.categoryId.value).toBe(read.category.id);
    expect(workspace.matchForm.controls.categoryId.value).toBe(read.category.id);
  });

  it('resets team selection and editable fields for a new team', () => {
    workspace.teamRead.set(createAdminSportsTeamRead());
    workspace.selectedTeamId.set('team-1');
    workspace.teamForm.patchValue({ id: 'team-1', name: 'Equipe existente', institution: 'FCT', status: 'ACTIVE' });

    workspace.newTeam();

    expect(workspace.teamRead()).toBeNull();
    expect(workspace.selectedTeamId()).toBe('');
    expect(workspace.teamForm.getRawValue()).toEqual({ id: '', name: '', institution: '', status: 'DRAFT' });
  });
});
