import { Directive, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { EventForm, MajorEvent, Person, PlacePreset } from '@cacic-fct/event-manager-admin-contracts';
import {
  DEFAULT_SPORTS_BRACKET_EDITOR_RULES,
  DEFAULT_SPORTS_CATEGORY_EMOJI,
  DEFAULT_SPORTS_OVERALL_SCORING_RULES,
  DEFAULT_SPORTS_SCORE_RULES,
  DEFAULT_SPORTS_STANDINGS_RULES,
  getDefaultSportsEmoji,
  getSportsTimerPreset,
  SPORTS_PRESET_KEYS,
  getSportsPreset,
} from '@cacic-fct/shared-data-types/sports-metadata';
import { Permission } from '@cacic-fct/shared-permissions';
import { Subscription, firstValueFrom } from 'rxjs';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { EventFormApiService } from '../graphql/event-form-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PlacePresetApiService } from '../graphql/place-preset-api.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SportsApiService } from './sports-api.service';
import type {
  SportsApplication,
  SportsCategoryRead,
  SportsMatchReview,
  SportsPendingMatchAction,
  SportsRegistrationRead,
  SportsTeamRead,
  SportsTournamentListItem,
  SportsTournamentRead,
} from './sports.models';
import { sportsTimerPreset, toIsoDateOrNull, toLocalDate } from './sports-workspace-form.utils';
import { createSportsWorkspaceForms } from './sports-workspace.forms';
import { createPlacementPointForm } from './sports-workspace.forms';
import { sportsWorkspaceRoute, type SportsWorkspaceArea } from './sports-workspace-routes';

@Directive()
export abstract class SportsWorkspaceBaseService implements OnDestroy {
  protected readonly api = inject(SportsApiService);
  private readonly majorEventsApi = inject(MajorEventApiService);
  private readonly eventFormsApi = inject(EventFormApiService);
  protected readonly peopleApi = inject(PeopleApiService);
  private readonly placesApi = inject(PlacePresetApiService);
  private readonly permissions = inject(PermissionsService);
  private readonly router = inject(Router, { optional: true });
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  protected liveSubscription: Subscription | null = null;
  protected liveRefreshRunning = false;
  protected liveRefreshQueued = false;
  protected selectionRevision = 0;
  private tournamentLoadRevision = 0;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly tournaments = signal<SportsTournamentListItem[]>([]);
  readonly eventForms = signal<EventForm[]>([]);
  readonly tournamentRead = signal<SportsTournamentRead | null>(null);
  readonly categoryRead = signal<SportsCategoryRead | null>(null);
  readonly teamRead = signal<SportsTeamRead | null>(null);
  readonly matchReview = signal<SportsMatchReview | null>(null);
  readonly pendingMatchActions = signal<SportsPendingMatchAction[]>([]);
  readonly applications = signal<SportsApplication[]>([]);
  readonly people = signal<Person[]>([]);
  readonly peopleTarget = signal<'representative' | 'official' | 'member' | null>(null);
  readonly places = signal<PlacePreset[]>([]);
  readonly selectedVenueId = signal('');
  readonly registrationReads = signal<Record<string, SportsRegistrationRead>>({});
  readonly lineupSelections = signal<Record<string, string[]>>({});
  readonly lineupDetails = signal<Record<string, Record<string, { role: string; shirtNumber: string }>>>({});
  readonly selectedMajorEventId = signal('');
  readonly activeArea = signal<'overview' | 'categories' | 'teams' | 'matches' | 'reviews'>('overview');
  readonly selectedCategoryId = signal('');
  readonly selectedTeamId = signal('');
  readonly selectedMatchId = signal('');
  readonly tournamentId = computed(() => this.tournamentRead()?.tournament.id ?? '');
  readonly inheritedRegistrationDates = computed(() => {
    const tournament = this.tournamentRead()?.tournament;
    const parent =
      tournament?.majorEvent ?? this.majorEvents().find((majorEvent) => majorEvent.id === tournament?.majorEventId);
    return {
      startDate: parent?.subscriptionStartDate ?? null,
      endDate: parent?.subscriptionEndDate ?? null,
    };
  });
  readonly pendingCount = computed(
    () =>
      this.applications().length +
      (this.teamRead()?.changeRequests.filter((request) =>
        ['PENDING', 'CONFLICT', 'CHANGES_REQUESTED'].includes(request.status),
      ).length ?? 0) +
      this.pendingMatchActions().length,
  );
  readonly registrationNames = computed<Readonly<Record<string, string>>>(() =>
    Object.fromEntries(
      (this.categoryRead()?.registrations ?? []).map((registration) => [
        registration.id,
        this.tournamentRead()?.teams.find((team) => team.id === registration.teamId)?.name ?? 'Equipe removida',
      ]),
    ),
  );

  private readonly forms = createSportsWorkspaceForms(this.fb);
  readonly tournamentForm = this.forms.tournament;
  readonly categoryForm = this.forms.category;
  readonly teamForm = this.forms.team;
  readonly registrationForm = this.forms.registration;
  readonly matchForm = this.forms.match;
  readonly representativeForm = this.forms.representative;
  readonly memberForm = this.forms.member;
  readonly officialForm = this.forms.official;
  readonly scoreEntryForm = this.forms.scoreEntry;
  readonly venueForm = this.forms.venue;
  readonly bracketForm = this.forms.bracket;

  applySportPreset(sport: string): void {
    const presetKey = SPORTS_PRESET_KEYS.find((key) => key === sport);
    if (!presetKey) {
      return;
    }

    const preset = getSportsPreset(presetKey);
    const timer = getSportsTimerPreset(presetKey);
    const format = preset.suggestedFormats[0] ?? 'CUSTOM';
    const bracketRules =
      format === 'GROUP_STAGE_ELIMINATION'
        ? {
            groupCount: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.groupCount,
            qualifiersPerGroup: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.qualifiersPerGroup,
            doubleRoundRobin: false,
          }
        : format === 'SWISS'
          ? { maximumRounds: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.swissMaximumRounds }
          : {};
    this.categoryForm.patchValue({
      sport: preset.key,
      emoji: getDefaultSportsEmoji(preset.key),
      customSportName: preset.key === 'OTHER' ? this.categoryForm.controls.customSportName.value : '',
      format,
      minimumRosterSize: preset.roster.minimumPlayers,
      maximumRosterSize: preset.roster.maximumPlayers ?? 0,
      maximumCaptains: preset.roster.maximumCaptains ?? 0,
      maximumCoaches: preset.roster.maximumCoaches ?? 0,
      allowPlayerMultipleTeams: false,
      certificatePolicy: 'INHERIT',
      periodsEnabled: preset.periods.enabled,
      maximumPeriods: preset.periods.maximum ?? 0,
      periodLabel: preset.periods.label,
      timerPreset: timer?.key ?? 'CUSTOM',
      timerOverallEnabled: timer?.overallEnabled ?? true,
      timerPeriodEnabled: timer?.periodEnabled ?? preset.periods.enabled,
      timerPeriodDurationMinutes: timer?.periodDurationMinutes ?? 0,
      timerAllowOvertime: timer?.allowOvertime ?? preset.periods.enabled,
      timerPeriodStartOffsetsMinutes: timer?.periodStartOffsetsMinutes.join(', ') ?? '0',
      scoreRulesJson: JSON.stringify(preset.score),
      scoreAllowDraw: preset.score.allowDraw,
      scoreHigherWins: preset.score.higherWins,
      scorePointStep: preset.score.pointStep,
      overallScoringMode: DEFAULT_SPORTS_OVERALL_SCORING_RULES.mode,
      overallMatchWinPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.win,
      overallMatchDrawPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.draw,
      overallMatchLossPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.loss,
      overallPlacementPointsJson: '{}',
      rosterRulesJson: '{}',
      bracketRulesJson: JSON.stringify(bracketRules),
      standingsRulesJson: JSON.stringify(DEFAULT_SPORTS_STANDINGS_RULES),
      standingsWinPoints: DEFAULT_SPORTS_STANDINGS_RULES.winPoints,
      standingsDrawPoints: DEFAULT_SPORTS_STANDINGS_RULES.drawPoints,
      standingsLossPoints: DEFAULT_SPORTS_STANDINGS_RULES.lossPoints,
      standingsByePoints: DEFAULT_SPORTS_STANDINGS_RULES.byePoints,
      doubleRoundRobin: false,
      groupCount: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.groupCount,
      qualifiersPerGroup: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.qualifiersPerGroup,
      swissMaximumRounds: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.swissMaximumRounds,
    });
    this.setPlacementPoints([]);
  }

  applyTimerPreset(preset: string): void {
    const values = sportsTimerPreset(preset);
    if (!values) {
      return;
    }
    this.categoryForm.patchValue({
      ...values,
    });
  }

  addPlacementPoint(): void {
    const positions = this.categoryForm.controls.overallPlacementPoints.controls.map(
      (control) => control.controls.position.value,
    );
    const nextPosition = Math.min(Math.max(0, ...positions) + 1, 100);
    if (positions.includes(nextPosition)) {
      return;
    }
    this.categoryForm.controls.overallPlacementPoints.push(createPlacementPointForm(this.fb, nextPosition));
  }

  removePlacementPoint(index: number): void {
    this.categoryForm.controls.overallPlacementPoints.removeAt(index);
  }

  protected setPlacementPoints(entries: Array<{ position?: number; points?: number }>): void {
    const placements = this.categoryForm.controls.overallPlacementPoints;
    placements.clear();
    for (const entry of entries) {
      if (typeof entry.position === 'number' && typeof entry.points === 'number') {
        placements.push(createPlacementPointForm(this.fb, entry.position, entry.points));
      }
    }
  }

  navigateToArea(
    area: SportsWorkspaceArea,
    selection: { categoryId?: string; teamId?: string; matchId?: string } = {},
  ): void {
    const tournamentId = this.tournamentId();
    if (!tournamentId || !this.router) {
      return;
    }
    void this.router.navigate(sportsWorkspaceRoute(tournamentId, area, selection)).catch(() => undefined);
  }

  navigateToTournamentList(): void {
    if (!this.router) {
      return;
    }
    void this.router.navigate(['/sports']).catch(() => undefined);
  }

  async initialize(): Promise<void> {
    await this.run('Não foi possível carregar os grandes eventos.', async () => {
      const [tournaments, majorEvents, places] = await Promise.all([
        firstValueFrom(this.api.tournaments({ take: 100 })),
        this.permissions.has(Permission.MajorEvent.Read)
          ? firstValueFrom(this.majorEventsApi.listMajorEvents({ take: 100 }))
          : Promise.resolve([]),
        this.permissions.has(Permission.PlacePreset.Read)
          ? firstValueFrom(this.placesApi.listPlacePresets({ take: 100 }))
          : Promise.resolve([]),
      ]);
      this.tournaments.set(tournaments);
      this.majorEvents.set(majorEvents);
      this.places.set(places);
    });
  }

  async openMajorEvent(majorEventId: string): Promise<void> {
    if (!majorEventId) {
      return;
    }
    this.selectedMajorEventId.set(majorEventId);
    await this.run('Não foi possível abrir ou criar o torneio.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>('createSportsTournament', 'SportsTournamentCreateInput', {
          majorEventId,
        }),
      );
      await this.loadTournament(id);
      this.tournaments.set(await firstValueFrom(this.api.tournaments({ take: 100 })));
      this.navigateToArea('overview');
    });
  }

  async loadTournament(id = this.tournamentId()): Promise<void> {
    if (!id) {
      return;
    }
    const loadRevision = ++this.tournamentLoadRevision;
    this.invalidateSelection();
    const sameTournament = this.tournamentId() === id;
    let read: SportsTournamentRead;
    try {
      read = await firstValueFrom(this.api.tournament(id));
    } catch (error) {
      if (loadRevision === this.tournamentLoadRevision) {
        this.error.set(error instanceof Error ? error.message : 'Não foi possível carregar o torneio esportivo.');
      }
      throw error;
    }
    if (loadRevision !== this.tournamentLoadRevision) {
      return;
    }
    this.tournamentRead.set(read);
    this.selectedMajorEventId.set(read.tournament.majorEventId);
    this.eventForms.set(
      this.permissions.has(Permission.EventForm.Read)
        ? await firstValueFrom(this.eventFormsApi.listForms({ majorEventId: read.tournament.majorEventId }))
        : [],
    );
    if (loadRevision !== this.tournamentLoadRevision) {
      return;
    }
    this.tournamentForm.patchValue({
      ...read.tournament,
      registrationScheduleMode:
        read.tournament.registrationStartDate || read.tournament.registrationEndDate ? 'CUSTOM' : 'INHERIT',
      registrationStartDate: toLocalDate(read.tournament.registrationStartDate),
      registrationEndDate: toLocalDate(read.tournament.registrationEndDate),
    });
    if (!sameTournament) {
      this.categoryRead.set(null);
      this.teamRead.set(null);
      this.matchReview.set(null);
      this.selectedCategoryId.set('');
      this.selectedTeamId.set('');
      this.selectedMatchId.set('');
      this.registrationReads.set({});
      this.lineupSelections.set({});
      this.lineupDetails.set({});
    }
    const [applications, pendingActions] = await Promise.all([
      this.permissions.has(Permission.SportsRegistration.Read)
        ? firstValueFrom(this.api.applicationQueue(id))
        : Promise.resolve([]),
      this.permissions.hasAll([Permission.SportsMatch.Read, Permission.SportsMatch.Review])
        ? firstValueFrom(this.api.matchActionReviewQueue(id))
        : Promise.resolve([]),
    ]);
    if (loadRevision !== this.tournamentLoadRevision) {
      return;
    }
    this.applications.set(applications);
    this.pendingMatchActions.set(pendingActions);
    this.watchTournament(id);
  }

  resetWorkspaceRoute(): void {
    this.tournamentLoadRevision += 1;
    this.invalidateSelection();
    this.liveSubscription?.unsubscribe();
    this.liveSubscription = null;
    this.tournamentRead.set(null);
    this.categoryRead.set(null);
    this.teamRead.set(null);
    this.matchReview.set(null);
    this.pendingMatchActions.set([]);
    this.applications.set([]);
    this.registrationReads.set({});
    this.lineupSelections.set({});
    this.lineupDetails.set({});
    this.selectedMajorEventId.set('');
    this.activeArea.set('overview');
    this.selectedCategoryId.set('');
    this.selectedTeamId.set('');
    this.selectedMatchId.set('');
  }

  async loadPendingMatchActions(): Promise<void> {
    const id = this.tournamentId();
    if (!id) {
      return;
    }
    this.pendingMatchActions.set(await firstValueFrom(this.api.matchActionReviewQueue(id)));
  }

  setTournamentRegistrationSchedule(mode: string): void {
    if (mode !== 'CUSTOM') {
      this.tournamentForm.controls.registrationScheduleMode.setValue('INHERIT');
      return;
    }

    this.tournamentForm.controls.registrationScheduleMode.setValue('CUSTOM');
    const startDate = this.tournamentForm.controls.registrationStartDate.value;
    const endDate = this.tournamentForm.controls.registrationEndDate.value;
    if (startDate || endDate) {
      return;
    }
    const inherited = this.inheritedRegistrationDates();
    this.tournamentForm.patchValue({
      registrationStartDate: toLocalDate(inherited.startDate),
      registrationEndDate: toLocalDate(inherited.endDate),
    });
  }

  ngOnDestroy(): void {
    this.tournamentLoadRevision += 1;
    this.invalidateSelection();
    this.liveSubscription?.unsubscribe();
  }

  protected beginSelection(): number {
    return ++this.selectionRevision;
  }

  protected invalidateSelection(): void {
    this.selectionRevision += 1;
  }

  async saveTournament(): Promise<void> {
    const read = this.tournamentRead();
    if (!read) {
      return;
    }
    const {
      registrationScheduleMode,
      registrationStartDate,
      registrationEndDate,
      ...settings
    } = this.tournamentForm.getRawValue();
    const registrationWindow =
      registrationScheduleMode === 'CUSTOM'
        ? {
            registrationStartDate: toIsoDateOrNull(registrationStartDate),
            registrationEndDate: toIsoDateOrNull(registrationEndDate),
          }
        : {
            registrationStartDate: null,
            registrationEndDate: null,
          };
    await this.run('Não foi possível salvar as regras gerais.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('updateSportsTournament', 'SportsTournamentUpdateInput', {
          id: read.tournament.id,
          expectedRevision: read.tournament.revision,
          ...settings,
          ...registrationWindow,
          selfSubscriptionAllowNoTeam: settings.selfSubscriptionEnabled && settings.selfSubscriptionAllowNoTeam,
          selfSubscriptionAllowNoCategory: settings.selfSubscriptionEnabled && settings.selfSubscriptionAllowNoCategory,
          finishedAt: settings.status === 'FINISHED' ? new Date().toISOString() : null,
        }),
      );
      await this.loadTournament(read.tournament.id);
      this.tournaments.set(await firstValueFrom(this.api.tournaments({ take: 100 })));
      this.notify('Regras gerais salvas.');
    });
  }

  async deleteTournament(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    if (
      !tournament ||
      !(await this.confirmAction(
        'Excluir torneio esportivo?',
        'Modalidades, equipes, partidas e revisões esportivas serão removidas. O grande evento será preservado.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir o torneio.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsTournament', tournament.id, tournament.revision));
      this.tournamentRead.set(null);
      this.pendingMatchActions.set([]);
      this.tournaments.set(await firstValueFrom(this.api.tournaments({ take: 100 })));
      this.resetWorkspaceRoute();
      this.navigateToTournamentList();
      this.notify('Torneio esportivo excluído. O grande evento foi preservado.');
    });
  }

  newCategory(navigate = true): void {
    this.invalidateSelection();
    this.selectedCategoryId.set('');
    this.categoryRead.set(null);
    this.categoryForm.reset({
      id: '',
      name: '',
      emoji: DEFAULT_SPORTS_CATEGORY_EMOJI,
      sport: '',
      customSportName: '',
      division: '',
      format: 'CUSTOM',
      status: 'DRAFT',
      registrationStartDate: '',
      registrationEndDate: '',
      minimumRosterSize: 0,
      maximumRosterSize: 0,
      maximumCaptains: 0,
      maximumCoaches: 0,
      allowPlayerMultipleTeams: false,
      athleteIdentifierMode: 'SHIRT_NUMBER',
      joiningInstructions: '',
      periodsEnabled: false,
      maximumPeriods: 0,
      periodLabel: 'Período',
      timerPreset: 'CUSTOM',
      timerOverallEnabled: true,
      timerPeriodEnabled: false,
      timerPeriodDurationMinutes: 0,
      timerAllowOvertime: false,
      timerPeriodStartOffsetsMinutes: '0',
      rulesText: '',
      scoreRulesJson: '{}',
      scoreAllowDraw: DEFAULT_SPORTS_SCORE_RULES.allowDraw,
      scoreHigherWins: DEFAULT_SPORTS_SCORE_RULES.higherWins,
      scorePointStep: DEFAULT_SPORTS_SCORE_RULES.pointStep,
      overallScoringMode: DEFAULT_SPORTS_OVERALL_SCORING_RULES.mode,
      overallMatchWinPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.win,
      overallMatchDrawPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.draw,
      overallMatchLossPoints: DEFAULT_SPORTS_OVERALL_SCORING_RULES.match.loss,
      overallPlacementPointsJson: '{}',
      rosterRulesJson: '{}',
      bracketRulesJson: '{}',
      standingsRulesJson: '{}',
      standingsWinPoints: DEFAULT_SPORTS_STANDINGS_RULES.winPoints,
      standingsDrawPoints: DEFAULT_SPORTS_STANDINGS_RULES.drawPoints,
      standingsLossPoints: DEFAULT_SPORTS_STANDINGS_RULES.lossPoints,
      standingsByePoints: DEFAULT_SPORTS_STANDINGS_RULES.byePoints,
      doubleRoundRobin: false,
      groupCount: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.groupCount,
      qualifiersPerGroup: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.qualifiersPerGroup,
      swissMaximumRounds: DEFAULT_SPORTS_BRACKET_EDITOR_RULES.swissMaximumRounds,
      registrationFormId: '',
    });
    this.setPlacementPoints([]);
    if (navigate) {
      this.navigateToArea('categories');
    }
  }

  protected abstract run(
    fallbackMessage: string,
    task: () => Promise<void>,
    showGlobalLoading?: boolean,
    allowWhenLoading?: boolean,
  ): Promise<void>;
  protected abstract notify(message: string, error?: boolean): void;
  protected abstract confirmAction(title: string, message: string): Promise<boolean>;
  protected abstract loadApplications(): Promise<void>;
  protected abstract watchTournament(tournamentId: string): void;
}
