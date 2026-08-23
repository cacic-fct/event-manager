import { DestroyRef, Directive, OnDestroy, computed, inject, signal } from '@angular/core';
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
  SportsMajorEventConfigurationFilter,
  SportsMajorEventWorkspaceItem,
  SportsTeamRead,
  SportsTournamentListItem,
  SportsTournamentRead,
  SportsOfficialSummary,
} from './sports.models';
import { sportsTimerPreset, toIsoDateOrNull, toLocalDate } from './sports-workspace-form.utils';
import { createSportsWorkspaceForms } from './sports-workspace.forms';
import { createPlacementPointForm } from './sports-workspace.forms';
import { sportsWorkspaceRoute, type SportsWorkspaceArea } from './sports-workspace-routes';
import {
  WORKSPACE_LIST_PAGE_SIZE,
  createWorkspaceListPagination,
  resetPagination,
} from '../pagination/list-pagination';
import { bindLiveSearch } from '../search/live-search';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';

interface SportsMajorEventWorkspaceFilters {
  query: string;
  startDateFrom: string;
  startDateUntil: string;
  configuration: SportsMajorEventConfigurationFilter;
}

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
  protected readonly feedback = inject(AdminFeedbackService);
  protected readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
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
  readonly editingOfficial = signal<SportsOfficialSummary | null>(null);
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
  readonly majorEventWorkspacePagination = createWorkspaceListPagination();
  readonly majorEventWorkspaceFilterForm = this.fb.nonNullable.group({
    query: [''],
    startDateFrom: [''],
    startDateUntil: [''],
    configuration: ['ALL' as SportsMajorEventConfigurationFilter],
  });
  private readonly majorEventWorkspaceFilters = signal<SportsMajorEventWorkspaceFilters>({
    query: '',
    startDateFrom: '',
    startDateUntil: '',
    configuration: 'ALL',
  });
  readonly majorEventWorkspaceItems = computed<SportsMajorEventWorkspaceItem[]>(() => {
    const tournamentsByMajorEventId = new Map(
      this.tournaments().map((item) => [item.majorEvent.id, item] as const),
    );
    const seenMajorEventIds = new Set<string>();
    const items: SportsMajorEventWorkspaceItem[] = this.majorEvents().map((majorEvent) => {
      seenMajorEventIds.add(majorEvent.id);
      return {
        majorEvent,
        tournament: tournamentsByMajorEventId.get(majorEvent.id),
      };
    });

    for (const item of this.tournaments()) {
      if (!seenMajorEventIds.has(item.majorEvent.id)) {
        items.push({ majorEvent: item.majorEvent, tournament: item });
      }
    }

    const filters = this.majorEventWorkspaceFilters();
    const query = filters.query.trim().toLocaleLowerCase('pt-BR');
    const startDateFrom = dateBoundary(filters.startDateFrom, 'start');
    const startDateUntil = dateBoundary(filters.startDateUntil, 'end');

    return items.filter((item) => {
      const hasTournament = Boolean(item.tournament);
      const startsAt = new Date(item.majorEvent.startDate).getTime();
      return (
        (!query || item.majorEvent.name.toLocaleLowerCase('pt-BR').includes(query)) &&
        (filters.configuration === 'ALL' ||
          (filters.configuration === 'CONFIGURED' && hasTournament) ||
          (filters.configuration === 'UNCONFIGURED' && !hasTournament)) &&
        (!startDateFrom || startsAt >= startDateFrom) &&
        (!startDateUntil || startsAt <= startDateUntil)
      );
    });
  });
  readonly visibleMajorEventWorkspaceItems = computed(() => {
    const start = this.majorEventWorkspacePagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE;
    return this.majorEventWorkspaceItems().slice(start, start + WORKSPACE_LIST_PAGE_SIZE);
  });
  readonly majorEventWorkspaceHasNextPage = computed(
    () =>
      (this.majorEventWorkspacePagination.pageIndex() + 1) * WORKSPACE_LIST_PAGE_SIZE <
      this.majorEventWorkspaceItems().length,
  );
  readonly majorEventWorkspacePaginationLabel = computed(() => {
    const total = this.majorEventWorkspaceItems().length;
    if (!total) {
      return '0';
    }

    const first = this.majorEventWorkspacePagination.pageIndex() * WORKSPACE_LIST_PAGE_SIZE + 1;
    const last = Math.min(first + WORKSPACE_LIST_PAGE_SIZE - 1, total);
    return `${first}-${last} de ${total}`;
  });
  readonly isEditingOfficial = computed(() => this.editingOfficial() !== null);
  readonly canReadOfficialContacts = computed(() => this.permissions.has(Permission.Person.Read));
  readonly canSearchPeople = computed(() => this.permissions.has(Permission.Person.Read));
  readonly canCreateTournament = computed(() => this.permissions.has(Permission.SportsTournament.Create));
  readonly canUpdateTournament = computed(() => this.permissions.has(Permission.SportsTournament.Update));
  readonly canDuplicateTournament = computed(() => this.permissions.has(Permission.SportsTournament.Duplicate));
  readonly canDeleteTournament = computed(() => this.permissions.has(Permission.SportsTournament.Delete));
  readonly canCreateCategory = computed(() => this.permissions.has(Permission.SportsCategory.Create));
  readonly canUpdateCategory = computed(() => this.permissions.has(Permission.SportsCategory.Update));
  readonly canDuplicateCategory = computed(() => this.permissions.has(Permission.SportsCategory.Duplicate));
  readonly canDeleteCategory = computed(() => this.permissions.has(Permission.SportsCategory.Delete));
  readonly canCreateTeam = computed(() => this.permissions.has(Permission.SportsTeam.Create));
  readonly canUpdateTeam = computed(() => this.permissions.has(Permission.SportsTeam.Update));
  readonly canDuplicateTeam = computed(() => this.permissions.has(Permission.SportsTeam.Duplicate));
  readonly canDeleteTeam = computed(() => this.permissions.has(Permission.SportsTeam.Delete));
  readonly canAssignRepresentative = computed(() =>
    this.permissions.has(Permission.SportsTeam.AssignRepresentative),
  );
  readonly canUpdateScore = computed(() => this.permissions.has(Permission.SportsScore.Update));
  readonly canCreateRegistration = computed(() => this.permissions.has(Permission.SportsRegistration.Create));
  readonly canUpdateRegistration = computed(() => this.permissions.has(Permission.SportsRegistration.Update));
  readonly canApproveRegistration = computed(() => this.permissions.has(Permission.SportsRegistration.Approve));
  readonly canRejectRegistration = computed(() => this.permissions.has(Permission.SportsRegistration.Reject));
  readonly canDeleteRegistration = computed(() => this.permissions.has(Permission.SportsRegistration.Delete));
  readonly canCreateAndPopulateRegistration = computed(
    () => this.canCreateRegistration() && this.canUpdateRegistration(),
  );
  readonly canManageRegistrationSelections = computed(
    () =>
      this.canCreateRegistration() &&
      this.canUpdateRegistration() &&
      this.canDeleteRegistration(),
  );
  readonly canEditMatchPublication = computed(() => this.permissions.has(Permission.SportsMatch.Update));
  readonly canOperateMatch = computed(() => this.permissions.has(Permission.SportsMatch.Operate));
  readonly canReviewMatch = computed(() => this.permissions.has(Permission.SportsMatch.Review));
  readonly canAssignOfficial = computed(() => this.permissions.has(Permission.SportsOfficial.Create));
  readonly canEditOfficial = computed(() => this.permissions.has(Permission.SportsOfficial.Update));
  readonly canRemoveOfficial = computed(() => this.permissions.has(Permission.SportsOfficial.Delete));
  readonly canSaveOfficial = computed(() =>
    this.isEditingOfficial() ? this.canEditOfficial() : this.canAssignOfficial(),
  );
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

  constructor() {
    bindLiveSearch({
      control: this.majorEventWorkspaceFilterForm,
      destroyRef: this.destroyRef,
      search: () => this.applyMajorEventWorkspaceFilters(),
    });
  }

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

  async navigateToTournamentList(replaceUrl = false): Promise<void> {
    if (!this.router) {
      return;
    }
    await this.router.navigate(['/sports'], { replaceUrl }).catch(() => undefined);
  }

  async initialize(): Promise<void> {
    await this.run('Não foi possível carregar os grandes eventos.', async () => {
      const [, places] = await Promise.all([
        this.loadMajorEventWorkspaceData(),
        this.permissions.has(Permission.PlacePreset.Read)
          ? firstValueFrom(this.placesApi.listPlacePresets({ take: 100 }))
          : Promise.resolve([]),
      ]);
      this.places.set(places);
    });
  }

  async applyMajorEventWorkspaceFilters(): Promise<void> {
    const filters = this.majorEventWorkspaceFilterForm.getRawValue();
    this.majorEventWorkspaceFilters.set(filters);
    resetPagination(this.majorEventWorkspacePagination);
    await this.run('Não foi possível filtrar os grandes eventos.', () => this.loadMajorEventWorkspaceData());
  }

  async resetMajorEventWorkspaceFilters(): Promise<void> {
    this.majorEventWorkspaceFilterForm.reset(
      {
        query: '',
        startDateFrom: '',
        startDateUntil: '',
        configuration: 'ALL',
      },
      { emitEvent: false },
    );
    await this.applyMajorEventWorkspaceFilters();
  }

  async previousMajorEventWorkspacePage(): Promise<void> {
    this.majorEventWorkspacePagination.pageIndex.update((page) => Math.max(0, page - 1));
  }

  async nextMajorEventWorkspacePage(): Promise<void> {
    if (!this.majorEventWorkspaceHasNextPage()) {
      return;
    }

    this.majorEventWorkspacePagination.pageIndex.update((page) => page + 1);
  }

  async openMajorEvent(majorEventId: string): Promise<void> {
    if (!majorEventId) {
      return;
    }
    const existingTournament = this.tournaments().find((item) => item.majorEvent.id === majorEventId);
    if (existingTournament) {
      await this.loadTournament(existingTournament.tournament.id);
      this.navigateToArea('overview');
      return;
    }
    if (!this.canCreateTournament()) {
      return;
    }

    const majorEvent = this.majorEvents().find((item) => item.id === majorEventId) ??
      this.tournaments().find((item) => item.majorEvent.id === majorEventId)?.majorEvent;
    if (
      !majorEvent ||
      !(await this.confirmAction(
        'Criar torneio esportivo?',
        `O grande evento “${majorEvent.name}” ainda não possui uma configuração esportiva.`,
        'Criar torneio',
        'default',
        [
          'Será criada uma configuração esportiva vinculada a este grande evento.',
          'O grande evento, suas atividades, inscrições, pagamentos e certificados serão preservados.',
        ],
      ))
    ) {
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
      await this.loadMajorEventWorkspaceData();
      this.navigateToArea('overview');
    });
  }

  private async loadMajorEventWorkspaceData(): Promise<void> {
    const filters = this.majorEventWorkspaceFilters();
    const query = filters.query.trim();
    const majorEventFilters = {
      ...(query ? { query } : {}),
      ...(filters.startDateFrom ? { startDateFrom: dateFilterIso(filters.startDateFrom, 'start') } : {}),
      ...(filters.startDateUntil ? { startDateUntil: dateFilterIso(filters.startDateUntil, 'end') } : {}),
      take: 100,
    };
    const tournamentFilters = {
      ...(query ? { query } : {}),
      take: 100,
    };
    const [tournaments, majorEvents] = await Promise.all([
      firstValueFrom(this.api.tournaments(tournamentFilters)),
      this.permissions.has(Permission.MajorEvent.Read)
        ? firstValueFrom(this.majorEventsApi.listMajorEvents(majorEventFilters))
        : Promise.resolve([]),
    ]);
    this.tournaments.set(tournaments);
    this.majorEvents.set(majorEvents);
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
    this.error.set(null);
    resetPagination(this.majorEventWorkspacePagination);
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
    this.cancelOfficialEdit();
  }

  cancelOfficialEdit(): void {
    this.editingOfficial.set(null);
    this.people.set([]);
    this.peopleTarget.set(null);
    this.officialForm.reset({ personQuery: '', personId: '', role: 'REFEREE', scope: 'MATCH' });
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
    if (!read || !this.canUpdateTournament()) {
      return;
    }
    if (this.tournamentForm.invalid) {
      this.tournamentForm.markAllAsTouched();
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
      !this.canDeleteTournament() ||
      !(await this.confirmAction(
        'Excluir torneio esportivo?',
        'Modalidades, equipes, partidas e revisões esportivas serão removidas. O grande evento será preservado.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir o torneio.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsTournament', tournament.id, tournament.revision));
      this.tournaments.update((items) => items.filter((item) => item.tournament.id !== tournament.id));
      this.resetWorkspaceRoute();
      await this.navigateToTournamentList(true);
      await this.loadMajorEventWorkspaceData();
      this.notify('Torneio esportivo excluído. O grande evento foi preservado.');
    });
  }

  newCategory(navigate = true): void {
    this.cancelOfficialEdit();
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
  protected abstract confirmAction(
    title: string,
    message: string,
    confirmLabel?: string,
    tone?: 'default' | 'danger',
    details?: readonly string[],
  ): Promise<boolean>;
  protected abstract loadApplications(): Promise<void>;
  protected abstract watchTournament(tournamentId: string): void;
}

function dateFilterIso(value: string, boundary: 'start' | 'end'): string {
  return `${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`;
}

function dateBoundary(value: string, boundary: 'start' | 'end'): number | null {
  if (!value) {
    return null;
  }

  const timestamp = new Date(dateFilterIso(value, boundary)).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}
