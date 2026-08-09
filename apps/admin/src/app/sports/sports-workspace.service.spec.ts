import { FormBuilder } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { EMPTY, of } from 'rxjs';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PlacePresetApiService } from '../graphql/place-preset-api.service';
import { SportsApiService } from './sports-api.service';
import { SportsWorkspaceService } from './sports-workspace.service';
import {
  createAdminSportsPendingMatchActions,
  createAdminSportsTeamRead,
  createAdminSportsTournamentRead,
} from './sports-story.fixtures';

describe('SportsWorkspaceService', () => {
  let workspace: SportsWorkspaceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        FormBuilder,
        SportsWorkspaceService,
        { provide: SportsApiService, useValue: {} },
        { provide: MajorEventApiService, useValue: {} },
        { provide: PeopleApiService, useValue: {} },
        { provide: PlacePresetApiService, useValue: {} },
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

  it('rejects unsafe or unsupported score-rule JSON before submission', () => {
    const control = workspace.categoryForm.controls.scoreRulesJson;

    control.setValue('{"allowDraw":"yes"}');
    expect(control.errors).toEqual({ scoreAllowDraw: true });

    control.setValue('{"constructor":{"prototype":{}}}');
    expect(control.errors).toEqual({ jsonUnsafe: true });

    control.setValue('{"strategy":"SETS","allowDraw":false,"higherWins":true,"pointStep":1}');
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
    api.mutate = vi.fn().mockReturnValue(of('registration-auto'));
    api.tournament = vi.fn().mockReturnValue(of(tournament));
    api.team = vi.fn().mockReturnValue(of(teamRead));
    api.applicationQueue = vi.fn().mockReturnValue(of([]));
    api.matchActionReviewQueue = vi.fn().mockReturnValue(of([]));
    api.watchTournamentReview = vi.fn().mockReturnValue(EMPTY);
    workspace.tournamentRead.set(tournament);
    workspace.teamRead.set(teamRead);

    await workspace.autoRegisterTeamInEligibleCategories();

    const registrationCalls = api.mutate.mock.calls.filter(([name]) => name === 'createSportsRegistration');
    const rosterCalls = api.mutate.mock.calls.filter(([name]) => name === 'assignSportsCategoryRole');
    expect(registrationCalls).toHaveLength(2);
    expect(rosterCalls).toHaveLength(2);
    expect(rosterCalls.map(([, , input]) => input)).toEqual([
      { registrationId: 'registration-auto', teamMemberId: 'member-1', role: 'PLAYER' },
      { registrationId: 'registration-auto', teamMemberId: 'member-1', role: 'PLAYER' },
    ]);
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
});
