import { Directive, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { MajorEvent, Person, PlacePreset } from '@cacic-fct/event-manager-admin-contracts';
import { Subscription, firstValueFrom } from 'rxjs';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PlacePresetApiService } from '../graphql/place-preset-api.service';
import { SportsApiService } from './sports-api.service';
import type {
  SportsApplication,
  SportsCategoryRead,
  SportsMatchReview,
  SportsRegistrationRead,
  SportsTeamRead,
  SportsTournamentListItem,
  SportsTournamentRead,
} from './sports.models';
import {
  sportsTimerPreset,
} from './sports-workspace-form.utils';
import { createSportsWorkspaceForms } from './sports-workspace.forms';

@Directive()
export abstract class SportsWorkspaceBaseService implements OnDestroy {
  protected readonly api = inject(SportsApiService);
  private readonly majorEventsApi = inject(MajorEventApiService);
  protected readonly peopleApi = inject(PeopleApiService);
  private readonly placesApi = inject(PlacePresetApiService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  protected liveSubscription: Subscription | null = null;
  protected liveRefreshRunning = false;
  protected liveRefreshQueued = false;

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly majorEvents = signal<MajorEvent[]>([]);
  readonly tournaments = signal<SportsTournamentListItem[]>([]);
  readonly tournamentRead = signal<SportsTournamentRead | null>(null);
  readonly categoryRead = signal<SportsCategoryRead | null>(null);
  readonly teamRead = signal<SportsTeamRead | null>(null);
  readonly matchReview = signal<SportsMatchReview | null>(null);
  readonly applications = signal<SportsApplication[]>([]);
  readonly people = signal<Person[]>([]);
  readonly peopleTarget = signal<'representative' | 'official' | 'member' | null>(null);
  readonly places = signal<PlacePreset[]>([]);
  readonly selectedVenueId = signal('');
  readonly registrationReads = signal<Record<string, SportsRegistrationRead>>({});
  readonly lineupSelections = signal<Record<string, string[]>>({});
  readonly lineupDetails = signal<
    Record<string, Record<string, { role: string; shirtNumber: string }>>
  >({});
  readonly selectedMajorEventId = signal('');
  readonly activeArea = signal<'overview' | 'categories' | 'teams' | 'matches' | 'reviews'>('overview');
  readonly selectedCategoryId = signal('');
  readonly selectedTeamId = signal('');
  readonly selectedMatchId = signal('');
  readonly tournamentId = computed(() => this.tournamentRead()?.tournament.id ?? '');
  readonly pendingCount = computed(
    () =>
      this.applications().length +
      (this.teamRead()?.changeRequests.filter((request) =>
        ['PENDING', 'CONFLICT', 'CHANGES_REQUESTED'].includes(request.status),
      ).length ?? 0) +
      (this.matchReview()?.actions.filter((action) => action.reviewStatus === 'PENDING').length ?? 0),
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
  readonly tournamentLookupForm = this.forms.tournamentLookup;
  readonly tournamentForm = this.forms.tournament;
  readonly categoryForm = this.forms.category;
  readonly teamForm = this.forms.team;
  readonly registrationForm = this.forms.registration;
  readonly matchForm = this.forms.match;
  readonly representativeForm = this.forms.representative;
  readonly memberForm = this.forms.member;
  readonly categoryRoleForm = this.forms.categoryRole;
  readonly officialForm = this.forms.official;
  readonly scoreEntryForm = this.forms.scoreEntry;
  readonly venueForm = this.forms.venue;
  readonly bracketForm = this.forms.bracket;

  applyTimerPreset(preset: string): void {
    const values = sportsTimerPreset(preset);
    if (!values) {
      return;
    }
    this.categoryForm.patchValue({
      ...values,
    });
  }

  async initialize(): Promise<void> {
    await this.run('Não foi possível carregar os grandes eventos.', async () => {
      const [majorEvents, tournaments, places] = await Promise.all([
        firstValueFrom(this.majorEventsApi.listMajorEvents({ take: 100 })),
        firstValueFrom(this.api.tournaments({ take: 100 })),
        firstValueFrom(this.placesApi.listPlacePresets({ take: 100 })),
      ]);
      this.majorEvents.set(majorEvents);
      this.tournaments.set(tournaments);
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
    });
  }

  async openTournamentFromLookup(): Promise<void> {
    const id = this.tournamentLookupForm.controls.tournamentId.value.trim();
    if (id) {
      await this.run('Torneio não encontrado ou sem permissão de acesso.', () => this.loadTournament(id));
    }
  }

  async loadTournament(id = this.tournamentId()): Promise<void> {
    if (!id) {
      return;
    }
    const read = await firstValueFrom(this.api.tournament(id));
    this.tournamentRead.set(read);
    this.selectedMajorEventId.set(read.tournament.majorEventId);
    this.tournamentLookupForm.controls.tournamentId.setValue(read.tournament.id);
    this.tournamentForm.patchValue(read.tournament);
    this.categoryRead.set(null);
    this.teamRead.set(null);
    this.matchReview.set(null);
    await this.loadApplications();
    this.watchTournament(id);
  }

  ngOnDestroy(): void {
    this.liveSubscription?.unsubscribe();
  }

  async saveTournament(): Promise<void> {
    const read = this.tournamentRead();
    if (!read) {
      return;
    }
    const settings = this.tournamentForm.getRawValue();
    await this.run('Não foi possível salvar as regras gerais.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('updateSportsTournament', 'SportsTournamentUpdateInput', {
          id: read.tournament.id,
          expectedRevision: read.tournament.revision,
          ...settings,
          selfSubscriptionAllowNoTeam:
            settings.selfSubscriptionEnabled && settings.selfSubscriptionAllowNoTeam,
          selfSubscriptionAllowNoCategory:
            settings.selfSubscriptionEnabled && settings.selfSubscriptionAllowNoCategory,
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
      await firstValueFrom(
        this.api.deleteVersioned('deleteSportsTournament', tournament.id, tournament.revision),
      );
      this.tournamentRead.set(null);
      this.tournaments.set(await firstValueFrom(this.api.tournaments({ take: 100 })));
      this.notify('Torneio esportivo excluído. O grande evento foi preservado.');
    });
  }

  newCategory(): void {
    this.selectedCategoryId.set('');
    this.categoryRead.set(null);
    this.categoryForm.reset({
      id: '',
      name: '',
      emoji: '⚽',
      sport: 'SOCCER',
      customSportName: '',
      division: '',
      format: 'SINGLE_ELIMINATION',
      status: 'DRAFT',
      registrationStartDate: '',
      registrationEndDate: '',
      minimumRosterSize: 0,
      maximumRosterSize: 0,
      maximumCaptains: 0,
      maximumCoaches: 0,
      allowPlayerMultipleTeams: false,
      periodsEnabled: false,
      maximumPeriods: 0,
      periodLabel: 'Tempo',
      timerPreset: 'SOCCER',
      timerOverallEnabled: true,
      timerPeriodEnabled: true,
      timerPeriodDurationMinutes: 45,
      timerAllowOvertime: true,
      timerPeriodStartOffsetsMinutes: '0, 45',
      rulesText: '',
      scoreRulesJson: '{}',
      rosterRulesJson: '{}',
      bracketRulesJson: '{}',
      standingsRulesJson: '{}',
      registrationFormId: '',
    });
  }

  protected abstract run(
    fallbackMessage: string,
    task: () => Promise<void>,
    showGlobalLoading?: boolean,
  ): Promise<void>;
  protected abstract notify(message: string, error?: boolean): void;
  protected abstract confirmAction(title: string, message: string): Promise<boolean>;
  protected abstract loadApplications(): Promise<void>;
  protected abstract watchTournament(tournamentId: string): void;
}
