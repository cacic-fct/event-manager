import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ValidationErrors, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { MajorEvent, Person, PlacePreset } from '@cacic-fct/event-manager-admin-contracts';
import { Subscription, firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../feedback/error-message';
import { ConfirmationDialogComponent } from '../app-shell/dialogs/confirmation-dialog.component';
import { MajorEventApiService } from '../graphql/major-event-api.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PlacePresetApiService } from '../graphql/place-preset-api.service';
import { SportsApiService } from './sports-api.service';
import {
  SportsCloneTournamentDialogComponent,
  type SportsCloneTournamentDialogResult,
} from './sports-clone-tournament-dialog.component';
import type {
  SportsApplication,
  SportsCategoryRead,
  SportsCategorySummary,
  SportsMatchReview,
  SportsMatchSummary,
  SportsRegistrationRead,
  SportsTeamRead,
  SportsTeamSummary,
  SportsTournamentListItem,
  SportsTournamentRead,
  SportsVenueSummary,
} from './sports.models';
import type { SportsTeamMemberStatus } from '@cacic-fct/shared-data-types';
import { SportsTextDialogComponent } from './sports-text-dialog.component';

type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

@Injectable()
export class SportsWorkspaceService implements OnDestroy {
  private readonly api = inject(SportsApiService);
  private readonly majorEventsApi = inject(MajorEventApiService);
  private readonly peopleApi = inject(PeopleApiService);
  private readonly placesApi = inject(PlacePresetApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private liveSubscription: Subscription | null = null;
  private liveRefreshRunning = false;
  private liveRefreshQueued = false;

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

  readonly tournamentLookupForm = this.fb.nonNullable.group({
    tournamentId: [''],
  });

  readonly tournamentForm = this.fb.nonNullable.group({
    status: ['DRAFT'],
    scoringMode: ['PER_SPORT'],
    selfSubscriptionEnabled: [false],
    selfSubscriptionAllowNoTeam: [false],
    selfSubscriptionAllowNoCategory: [false],
    allowPlayerMultipleTeams: [false],
  });

  readonly categoryForm = this.fb.nonNullable.group({
    id: [''],
    name: ['', Validators.required],
    emoji: ['⚽', Validators.required],
    sport: ['SOCCER'],
    customSportName: [''],
    division: [''],
    format: ['SINGLE_ELIMINATION'],
    status: ['DRAFT'],
    registrationStartDate: [''],
    registrationEndDate: [''],
    minimumRosterSize: [0],
    maximumRosterSize: [0],
    maximumCaptains: [0],
    maximumCoaches: [0],
    allowPlayerMultipleTeams: [false],
    periodsEnabled: [false],
    maximumPeriods: [0],
    periodLabel: ['Tempo'],
    rulesText: [''],
    scoreRulesJson: ['{}', scoreRulesValidator],
    rosterRulesJson: ['{}', jsonObjectValidator],
    bracketRulesJson: ['{}', jsonObjectValidator],
    standingsRulesJson: ['{}', jsonObjectValidator],
    registrationFormId: [''],
  });

  readonly teamForm = this.fb.nonNullable.group({
    id: [''],
    name: ['', Validators.required],
    institution: [''],
    status: ['DRAFT'],
  });

  readonly registrationForm = this.fb.nonNullable.group({
    teamId: ['', Validators.required],
    categoryId: ['', Validators.required],
    seed: [0],
    formAnswersJson: ['{}', jsonObjectValidator],
  });

  readonly matchForm = this.fb.nonNullable.group({
    id: [''],
    categoryId: ['', Validators.required],
    name: ['Partida'],
    startDate: ['', Validators.required],
    endDate: ['', Validators.required],
    stageId: [''],
    venueId: [''],
    homeRegistrationId: [''],
    awayRegistrationId: [''],
    roundNumber: [1],
    bracketPosition: [1],
    groupKey: [''],
    state: ['SCHEDULED'],
  });

  readonly representativeForm = this.fb.nonNullable.group({
    personQuery: ['', Validators.required],
    personId: ['', Validators.required],
  });

  readonly memberForm = this.fb.nonNullable.group({
    personQuery: ['', Validators.required],
    personId: ['', Validators.required],
  });

  readonly categoryRoleForm = this.fb.nonNullable.group({
    registrationId: ['', Validators.required],
    teamMemberId: ['', Validators.required],
    role: ['PLAYER'],
  });

  readonly officialForm = this.fb.nonNullable.group({
    personQuery: ['', Validators.required],
    personId: ['', Validators.required],
    role: ['REFEREE'],
    scope: ['MATCH'],
  });

  readonly scoreEntryForm = this.fb.nonNullable.group({
    teamId: ['', Validators.required],
    source: ['MANUAL'],
    points: [0],
    reason: ['', Validators.required],
  });

  readonly venueForm = this.fb.nonNullable.group({
    id: [''],
    placePresetId: ['', Validators.required],
    name: ['', Validators.required],
    courtLabel: [''],
    capacity: [0],
    notes: [''],
    parentVenueId: [''],
  });

  readonly bracketForm = this.fb.nonNullable.group({
    randomizeUnseeded: [true],
    randomSeed: [''],
    replaceExistingDraft: [false],
  });

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
      rulesText: '',
      scoreRulesJson: '{}',
      rosterRulesJson: '{}',
      bracketRulesJson: '{}',
      standingsRulesJson: '{}',
      registrationFormId: '',
    });
  }

  async selectCategory(category: SportsCategorySummary): Promise<void> {
    await this.run('Não foi possível carregar a modalidade.', async () => {
      const read = await firstValueFrom(this.api.category(category.id));
      this.categoryRead.set(read);
      this.selectedCategoryId.set(category.id);
      this.categoryForm.patchValue(this.categoryToForm(read.category));
      this.registrationForm.controls.categoryId.setValue(category.id);
      this.matchForm.controls.categoryId.setValue(category.id);
    });
  }

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid || !this.tournamentId()) {
      this.categoryForm.markAllAsTouched();
      return;
    }
    const raw = this.categoryForm.getRawValue();
    const existing = this.categoryRead()?.category;
    await this.run('Não foi possível salvar a modalidade.', async () => {
      const payload = {
        ...this.nullableCategoryValues(raw),
        emoji: raw.emoji,
        ...(existing
          ? { id: existing.id, expectedRevision: existing.revision }
          : { tournamentId: this.tournamentId() }),
      };
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsCategory' : 'createSportsCategory',
          existing ? 'SportsCategoryUpdateInput' : 'SportsCategoryCreateInput',
          payload,
        ),
      );
      await this.loadTournament();
      const category = this.tournamentRead()?.categories.find((item) => item.id === id);
      if (category) {
        await this.selectCategory(category);
      }
      this.notify('Modalidade salva.');
    });
  }

  async deleteCategory(category: SportsCategorySummary): Promise<void> {
    if (
      !(await this.confirmAction(
        `Excluir ${category.name}?`,
        'Inscrições, chave e partidas vinculadas serão removidas.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a modalidade.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsCategory', category.id, category.revision));
      this.newCategory();
      await this.loadTournament();
    });
  }

  async cloneSelectedCategory(): Promise<void> {
    const category = this.categoryRead()?.category;
    if (!category) {
      return;
    }
    const destinationTournamentId = await this.askText(
      'Duplicar modalidade',
      'Informe o torneio que receberá a cópia. Inscrições e resultados não serão copiados.',
      'ID do torneio de destino',
      this.tournamentId(),
    );
    if (!destinationTournamentId) {
      return;
    }
    await this.run('Não foi possível duplicar a modalidade.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('cloneSportsCategory', 'SportsCategoryCloneInput', {
          sourceCategoryId: category.id,
          destinationTournamentId,
          name: `${category.name} (cópia)`,
          includeRegistrations: false,
          includeStages: false,
          includeOfficials: true,
        }),
      );
      if (destinationTournamentId === this.tournamentId()) {
        await this.loadTournament();
      }
      this.notify('Modalidade duplicada. Inscrições e chave não foram copiadas.');
    });
  }

  newTeam(): void {
    this.teamRead.set(null);
    this.selectedTeamId.set('');
    this.teamForm.reset({ id: '', name: '', institution: '', status: 'DRAFT' });
  }

  async selectTeam(team: SportsTeamSummary): Promise<void> {
    await this.run('Não foi possível carregar a equipe.', async () => {
      const read = await firstValueFrom(this.api.team(team.id));
      if (!read?.team) {
        throw new Error('A resposta da equipe não trouxe os dados esperados.');
      }
      this.teamRead.set(read);
      this.selectedTeamId.set(team.id);
      this.teamForm.patchValue({
        id: read.team.id,
        name: read.team.name,
        institution: read.team.institution ?? '',
        status: read.team.status,
      });
      this.registrationForm.controls.teamId.setValue(team.id);
    });
  }

  async saveTeam(): Promise<void> {
    if (this.teamForm.invalid || !this.tournamentId()) {
      this.teamForm.markAllAsTouched();
      return;
    }
    const raw = this.teamForm.getRawValue();
    const existing = this.teamRead()?.team;
    await this.run('Não foi possível salvar a equipe.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsTeam' : 'createSportsTeam',
          existing ? 'SportsTeamUpdateInput' : 'SportsTeamCreateInput',
          existing
            ? {
                id: existing.id,
                expectedRevision: existing.revision,
                name: raw.name,
                institution: raw.institution || null,
                status: raw.status,
              }
            : {
                tournamentId: this.tournamentId(),
                name: raw.name,
                institution: raw.institution || null,
                status: raw.status,
              },
        ),
      );
      await this.loadTournament();
      const team = this.tournamentRead()?.teams.find((item) => item.id === id);
      if (team) {
        await this.selectTeam(team);
      }
      this.notify('Equipe salva.');
    });
  }

  async deleteSelectedTeam(): Promise<void> {
    const team = this.teamRead()?.team;
    if (
      !team ||
      !(await this.confirmAction(
        `Excluir ${team.name}?`,
        'Inscrições e escalações desta equipe serão removidas do torneio.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a equipe.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsTeam', team.id, team.revision));
      this.newTeam();
      await this.loadTournament();
    });
  }

  async uploadTeamLogo(file: File): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.notify('Use uma imagem PNG, JPEG ou WebP.', true);
      return;
    }
    await this.run('Não foi possível enviar o escudo.', async () => {
      await firstValueFrom(this.api.uploadTeamLogo(team.id, team.revision, file));
      await this.loadTournament();
      const refreshed = this.tournamentRead()?.teams.find((item) => item.id === team.id);
      if (refreshed) {
        await this.selectTeam(refreshed);
      }
      this.notify('Escudo atualizado e armazenado sem expiração.');
    });
  }

  async cloneSelectedTeam(): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    const destinationTournamentId = await this.askText(
      'Duplicar equipe',
      'O escudo será preservado. Representantes e atletas não serão copiados.',
      'ID do torneio de destino',
      this.tournamentId(),
    );
    if (!destinationTournamentId) {
      return;
    }
    await this.run('Não foi possível duplicar a equipe.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('cloneSportsTeam', 'SportsTeamCloneInput', {
          sourceTeamId: team.id,
          destinationTournamentId,
          name: `${team.name} (cópia)`,
          includeLogo: true,
          includeRepresentatives: false,
          includeMembers: false,
        }),
      );
      if (destinationTournamentId === this.tournamentId()) {
        await this.loadTournament();
      }
      this.notify('Equipe duplicada. Representantes e atletas não foram copiados.');
    });
  }

  async searchPeople(
    query: string,
    target: 'representative' | 'official' | 'member',
  ): Promise<void> {
    const normalized = query.trim();
    if (normalized.length < 2) {
      this.people.set([]);
      this.peopleTarget.set(null);
      return;
    }
    this.peopleTarget.set(target);
    await this.run('Não foi possível buscar pessoas.', async () => {
      this.people.set(await firstValueFrom(this.peopleApi.listPeopleSummaries({ query: normalized, take: 10 })));
    }, false);
  }

  pickPerson(person: Person, target: 'representative' | 'official' | 'member'): void {
    const form =
      target === 'representative'
        ? this.representativeForm
        : target === 'official'
          ? this.officialForm
          : this.memberForm;
    form.patchValue({ personId: person.id, personQuery: person.name });
    this.people.set([]);
    this.peopleTarget.set(null);
  }

  async assignRepresentative(): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team || this.representativeForm.invalid) {
      return;
    }
    await this.run('Não foi possível atribuir o representante.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('assignSportsTeamRepresentative', 'SportsRepresentativeAssignInput', {
          teamId: team.id,
          personId: this.representativeForm.controls.personId.value,
        }),
      );
      await this.selectTeam(team);
      this.representativeForm.reset();
      this.notify('Representante atribuído.');
    });
  }

  async revokeRepresentative(representativeId: string): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    await this.run('Não foi possível revogar o representante.', async () => {
      await firstValueFrom(
        this.api.mutate<boolean>('revokeSportsTeamRepresentative', 'SportsRepresentativeRevokeInput', {
          representativeId,
        }),
      );
      await this.selectTeam(team);
    });
  }

  async addTeamMember(): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team || this.memberForm.invalid) {
      return;
    }
    await this.run('Não foi possível adicionar o integrante.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('createSportsTeamMember', 'SportsTeamMemberCreateInput', {
          teamId: team.id,
          personId: this.memberForm.controls.personId.value,
        }),
      );
      await this.selectTeam(team);
      this.memberForm.reset();
      this.notify('Integrante adicionado. A cobrança foi habilitada quando aplicável.');
    });
  }

  async updateTeamMember(
    member: NonNullable<SportsTeamRead['members']>[number],
    status: SportsTeamMemberStatus,
  ): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    await this.run('Não foi possível alterar o integrante.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('updateSportsTeamMember', 'SportsTeamMemberUpdateInput', {
          id: member.id,
          expectedRevision: member.revision,
          status,
        }),
      );
      await this.selectTeam(team);
      this.notify('Status do integrante atualizado.');
    });
  }

  async assignCategoryRole(): Promise<void> {
    if (this.categoryRoleForm.invalid) {
      return;
    }
    await this.run('Não foi possível atribuir a função na modalidade.', async () => {
      await firstValueFrom(
        this.api.mutate<string>(
          'assignSportsCategoryRole',
          'SportsRegistrationMemberUpsertInput',
          this.categoryRoleForm.getRawValue(),
        ),
      );
      this.notify('Função na modalidade atualizada.');
    });
  }

  async createRegistration(): Promise<void> {
    if (this.registrationForm.invalid) {
      return;
    }
    const raw = this.registrationForm.getRawValue();
    await this.run('Não foi possível inscrever a equipe.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('createSportsRegistration', 'SportsRegistrationCreateInput', {
          teamId: raw.teamId,
          categoryId: raw.categoryId,
          seed: raw.seed || null,
          formAnswersJson: raw.formAnswersJson || null,
        }),
      );
      const category = this.tournamentRead()?.categories.find((item) => item.id === raw.categoryId);
      if (category) {
        await this.selectCategory(category);
      }
      this.notify('Inscrição criada.');
    });
  }

  async setRegistrationStatus(
    registration: NonNullable<SportsCategoryRead['registrations']>[number],
    status: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'ACTIVE',
  ): Promise<void> {
    const category = this.categoryRead()?.category;
    if (!category) {
      return;
    }
    await this.run('Não foi possível atualizar a inscrição.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('updateSportsRegistration', 'SportsRegistrationUpdateInput', {
          id: registration.id,
          expectedRevision: registration.revision,
          status,
        }),
      );
      await this.selectCategory(category);
      this.notify('Estado da inscrição atualizado.');
    });
  }

  async deleteRegistration(registration: NonNullable<SportsCategoryRead['registrations']>[number]): Promise<void> {
    const category = this.categoryRead()?.category;
    if (
      !category ||
      !(await this.confirmAction(
        'Excluir inscrição?',
        'A equipe deixará esta modalidade e suas escalações serão removidas.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a inscrição.', async () => {
      await firstValueFrom(
        this.api.deleteVersioned('deleteSportsRegistration', registration.id, registration.revision),
      );
      await this.selectCategory(category);
    });
  }

  newMatch(): void {
    const categoryId = this.selectedCategoryId();
    this.matchReview.set(null);
    this.selectedMatchId.set('');
    this.matchForm.reset({
      id: '',
      categoryId,
      name: 'Partida',
      startDate: '',
      endDate: '',
      stageId: '',
      venueId: '',
      homeRegistrationId: '',
      awayRegistrationId: '',
      roundNumber: 1,
      bracketPosition: 1,
      groupKey: '',
      state: 'SCHEDULED',
    });
  }

  async selectMatch(match: SportsMatchSummary): Promise<void> {
    await this.run('Não foi possível carregar a partida.', async () => {
      const read = await firstValueFrom(this.api.matchReview(match.id));
      this.matchReview.set(read);
      this.selectedMatchId.set(match.id);
      this.matchForm.patchValue({
        id: match.id,
        categoryId: match.categoryId,
        name: match.event?.name ?? 'Partida',
        startDate: this.toLocalDate(match.event?.startDate),
        endDate: this.toLocalDate(match.event?.endDate),
        stageId: match.stageId ?? '',
        venueId: match.venueId ?? '',
        homeRegistrationId: match.homeRegistrationId ?? '',
        awayRegistrationId: match.awayRegistrationId ?? '',
        roundNumber: match.roundNumber ?? 1,
        bracketPosition: match.bracketPosition ?? 1,
        groupKey: match.groupKey ?? '',
        state: match.state,
      });
      await this.loadMatchRegistrations(read);
    });
  }

  isLineupSelected(registrationId: string, registrationMemberId: string): boolean {
    return this.lineupSelections()[registrationId]?.includes(registrationMemberId) ?? false;
  }

  toggleLineup(registrationId: string, registrationMemberId: string, selected: boolean): void {
    this.lineupSelections.update((current) => {
      const values = new Set(current[registrationId] ?? []);
      if (selected) {
        values.add(registrationMemberId);
      } else {
        values.delete(registrationMemberId);
      }
      return { ...current, [registrationId]: [...values] };
    });
  }

  async saveLineup(registrationId: string): Promise<void> {
    const match = this.matchReview()?.match;
    const registration = this.registrationReads()[registrationId];
    if (!match || !registration) {
      return;
    }
    const existing = this.matchReview()?.rosters.find((roster) => roster.registrationId === registrationId);
    const selected = new Set(this.lineupSelections()[registrationId] ?? []);
    await this.run('Não foi possível salvar a escalação.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('upsertAdminSportsMatchRoster', 'SportsMatchRosterUpsertInput', {
          matchId: match.id,
          registrationId,
          expectedRevision: existing?.revision,
          status: 'APPROVED',
          entries: registration.members
            .filter((member) => selected.has(member.id))
            .map((member) => ({
              registrationMemberId: member.id,
              role: member.role,
              status: 'APPROVED',
            })),
        }),
      );
      await this.selectMatch(match);
      this.notify('Escalação da partida salva.');
    });
  }

  async saveMatch(): Promise<void> {
    if (this.matchForm.invalid) {
      this.matchForm.markAllAsTouched();
      return;
    }
    const raw = this.matchForm.getRawValue();
    const existing = this.matchReview()?.match;
    await this.run('Não foi possível salvar a partida.', async () => {
      const payload = existing
        ? {
            id: existing.id,
            expectedRevision: existing.revision,
            startDate: this.dateOrUndefined(raw.startDate),
            endDate: this.dateOrUndefined(raw.endDate),
            stageId: raw.stageId || null,
            venueId: raw.venueId || null,
            homeRegistrationId: raw.homeRegistrationId || null,
            awayRegistrationId: raw.awayRegistrationId || null,
            roundNumber: raw.roundNumber || null,
            bracketPosition: raw.bracketPosition || null,
            groupKey: raw.groupKey || null,
            state: raw.state,
          }
        : {
            categoryId: raw.categoryId,
            name: raw.name,
            startDate: this.dateOrUndefined(raw.startDate),
            endDate: this.dateOrUndefined(raw.endDate),
            stageId: raw.stageId || null,
            venueId: raw.venueId || null,
            homeRegistrationId: raw.homeRegistrationId || null,
            awayRegistrationId: raw.awayRegistrationId || null,
            roundNumber: raw.roundNumber || null,
            bracketPosition: raw.bracketPosition || null,
            groupKey: raw.groupKey || null,
          };
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsMatch' : 'createSportsMatch',
          existing ? 'SportsMatchUpdateInput' : 'SportsMatchCreateInput',
          payload,
        ),
      );
      const category = this.tournamentRead()?.categories.find((item) => item.id === raw.categoryId);
      if (category) {
        await this.selectCategory(category);
        const match = this.categoryRead()?.matches.find((item) => item.id === id);
        if (match) {
          await this.selectMatch(match);
        }
      }
      this.notify('Partida salva.');
    });
  }

  async deleteSelectedMatch(): Promise<void> {
    const match = this.matchReview()?.match;
    const category = this.categoryRead()?.category;
    if (
      !match ||
      !category ||
      !(await this.confirmAction(
        'Excluir partida?',
        'A partida e o evento de calendário associado serão removidos.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a partida.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsMatch', match.id, match.revision));
      this.newMatch();
      await this.selectCategory(category);
    });
  }

  async assignOfficial(): Promise<void> {
    if (this.officialForm.invalid || !this.tournamentId()) {
      return;
    }
    const raw = this.officialForm.getRawValue();
    await this.run('Não foi possível atribuir o oficial.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('assignSportsOfficial', 'SportsOfficialAssignInput', {
          tournamentId: this.tournamentId(),
          categoryId: raw.scope === 'CATEGORY' ? this.selectedCategoryId() || null : null,
          matchId: raw.scope === 'MATCH' ? this.selectedMatchId() || null : null,
          personId: raw.personId,
          role: raw.role,
        }),
      );
      const match = this.matchReview()?.match;
      if (match) {
        await this.selectMatch(match);
      }
      this.officialForm.reset({ personQuery: '', personId: '', role: 'REFEREE', scope: 'MATCH' });
      this.notify('Função esportiva atribuída.');
    });
  }

  async generateBracket(): Promise<void> {
    const category = this.categoryRead();
    if (!category || category.registrations.length < 2) {
      this.notify('A modalidade precisa de pelo menos duas inscrições.', true);
      return;
    }
    await this.run('Não foi possível gerar a chave.', async () => {
      const raw = this.bracketForm.getRawValue();
      await firstValueFrom(
        this.api.mutate<string[]>('generateSportsBracket', 'SportsBracketGenerateInput', {
          categoryId: category.category.id,
          participants: category.registrations.map((registration) => ({
            registrationId: registration.id,
            seed: registration.seed ?? null,
          })),
          randomizeUnseeded: raw.randomizeUnseeded,
          randomSeed: raw.randomSeed || null,
          replaceExistingDraft: raw.replaceExistingDraft,
        }),
      );
      await this.selectCategory(category.category);
      this.notify('Chave gerada. Revise confrontos e horários antes de publicar.');
    });
  }

  async createScoreEntry(): Promise<void> {
    if (this.scoreEntryForm.invalid || !this.tournamentId()) {
      return;
    }
    await this.run('Não foi possível registrar a pontuação.', async () => {
      await firstValueFrom(
        this.api.mutate<string>(
          'createSportsTournamentScoreEntry',
          'SportsTournamentScoreEntryInput',
          {
            tournamentId: this.tournamentId(),
            ...this.scoreEntryForm.getRawValue(),
          },
        ),
      );
      await this.loadTournament();
      this.scoreEntryForm.reset({ teamId: '', source: 'MANUAL', points: 0, reason: '' });
    });
  }

  newVenue(): void {
    this.selectedVenueId.set('');
    this.venueForm.reset({
      id: '',
      placePresetId: '',
      name: '',
      courtLabel: '',
      capacity: 0,
      notes: '',
      parentVenueId: '',
    });
  }

  selectVenue(venue: SportsVenueSummary): void {
    this.selectedVenueId.set(venue.id);
    this.venueForm.patchValue({
      id: venue.id,
      placePresetId: venue.placePresetId,
      name: venue.name,
      courtLabel: venue.courtLabel ?? '',
      capacity: venue.capacity ?? 0,
      notes: venue.notes ?? '',
      parentVenueId: venue.parentVenueId ?? '',
    });
    this.matchForm.controls.venueId.setValue(venue.id);
  }

  async saveVenue(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    if (!tournament || this.venueForm.invalid) {
      this.venueForm.markAllAsTouched();
      return;
    }
    const raw = this.venueForm.getRawValue();
    const existing = this.tournamentRead()?.venues.find((venue) => venue.id === raw.id);
    await this.run('Não foi possível salvar o local esportivo.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsVenue' : 'createSportsVenue',
          existing ? 'SportsVenueUpdateInput' : 'SportsVenueCreateInput',
          {
            ...(existing
              ? {
                  id: existing.id,
                  tournamentId: tournament.id,
                  expectedRevision: existing.revision,
                }
              : { tournamentId: tournament.id }),
            placePresetId: raw.placePresetId,
            name: raw.name,
            courtLabel: raw.courtLabel || null,
            capacity: raw.capacity || null,
            notes: raw.notes || null,
            parentVenueId: raw.parentVenueId || null,
          },
        ),
      );
      await this.loadTournament();
      const venue = this.tournamentRead()?.venues.find((item) => item.id === id);
      if (venue) {
        this.selectVenue(venue);
      }
      this.notify('Local esportivo salvo.');
    });
  }

  async deleteSelectedVenue(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    const venue = this.tournamentRead()?.venues.find((item) => item.id === this.selectedVenueId());
    if (
      !tournament ||
      !venue ||
      !(await this.confirmAction(
        `Excluir ${venue.name}?`,
        'Partidas futuras precisarão receber outro local.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir o local esportivo.', async () => {
      await firstValueFrom(
        this.api.deleteVersioned('deleteSportsVenue', venue.id, venue.revision, tournament.id),
      );
      this.newVenue();
      await this.loadTournament();
    });
  }

  async loadApplications(): Promise<void> {
    if (!this.tournamentId()) {
      return;
    }
    this.applications.set(await firstValueFrom(this.api.applicationQueue(this.tournamentId())));
  }

  async reviewApplication(application: SportsApplication, decision: ReviewDecision): Promise<void> {
    const message =
      decision === 'APPROVED'
        ? null
        : await this.askText(
            'Mensagem da revisão',
            'Explique de forma objetiva o que precisa mudar ou por que a inscrição foi negada.',
            'Mensagem para a pessoa inscrita',
            '',
            true,
          );
    if (decision !== 'APPROVED' && !message) {
      return;
    }
    await this.run('Não foi possível revisar a inscrição.', async () => {
      await firstValueFrom(
        this.api.reviewApplication({
          applicationId: application.id,
          decision,
          reviewMessage: message,
        }),
      );
      await this.loadApplications();
      this.notify('Inscrição revisada.');
    });
  }

  async reviewTeamChange(
    request: NonNullable<SportsTeamRead['changeRequests']>[number],
    decision: ReviewDecision,
  ): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    const message =
      decision === 'APPROVED'
        ? null
        : await this.askText(
            'Mensagem da revisão',
            'Descreva o ajuste necessário para que o representante possa reenviar o delta.',
            'Mensagem para o representante',
            '',
            true,
          );
    if (decision !== 'APPROVED' && !message) {
      return;
    }
    await this.run('Não foi possível revisar a alteração.', async () => {
      await firstValueFrom(
        this.api.reviewTeamChange({
          requestId: request.id,
          expectedRequestRevision: request.requestRevision,
          decision,
          reviewMessage: message,
        }),
      );
      await this.selectTeam(team);
      await this.loadTournament();
      this.notify('Alteração revisada.');
    });
  }

  async reviewAction(actionId: string, decision: ReviewDecision): Promise<void> {
    const match = this.matchReview()?.match;
    if (!match) {
      return;
    }
    const message =
      decision === 'APPROVED'
        ? null
        : await this.askText(
            'Orientação da revisão',
            'Explique a correção necessária na ação da partida.',
            'Orientação para o oficial',
            '',
            true,
          );
    if (decision !== 'APPROVED' && !message) {
      return;
    }
    await this.run('Não foi possível revisar a ação.', async () => {
      await firstValueFrom(
        this.api.reviewMatchAction({
          actionId,
          decision,
          reviewMessage: message,
        }),
      );
      await this.selectMatch(match);
      this.notify('Ação da partida revisada.');
    });
  }

  async cloneTournament(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    if (!tournament) {
      return;
    }
    const source = this.majorEvents().find((majorEvent) => majorEvent.id === tournament.majorEventId);
    const result = await firstValueFrom(
      this.dialog
        .open<SportsCloneTournamentDialogComponent, unknown, SportsCloneTournamentDialogResult>(
          SportsCloneTournamentDialogComponent,
          {
            data: {
              sourceMajorEventId: tournament.majorEventId,
              sourceName: source?.name ?? 'Torneio atual',
              destinations: this.majorEvents()
                .filter((majorEvent) => majorEvent.id !== tournament.majorEventId)
                .map((majorEvent) => ({
                  id: majorEvent.id,
                  name: majorEvent.name,
                  emoji: majorEvent.emoji,
                })),
            },
            width: '38rem',
          },
        )
        .afterClosed(),
    );
    if (!result) {
      return;
    }
    await this.run('Não foi possível duplicar o torneio.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>('cloneSportsTournament', 'SportsTournamentCloneInput', {
          sourceTournamentId: this.tournamentId(),
          destinationMajorEventId: result.destinationMajorEventId,
          parts: result.parts,
        }),
      );
      await this.loadTournament(id);
      this.tournaments.set(await firstValueFrom(this.api.tournaments({ take: 100 })));
      this.notify('Torneio duplicado e aberto para revisão.');
    });
  }

  teamNameForRegistration(registrationId?: string | null): string {
    if (!registrationId) {
      return 'A definir';
    }
    const registration = this.categoryRead()?.registrations.find((item) => item.id === registrationId);
    return this.tournamentRead()?.teams.find((team) => team.id === registration?.teamId)?.name ?? 'Equipe removida';
  }

  teamModalitiesLabel(teamId: string): string {
    const registrations = this.teamModalities(teamId);
    if (!registrations) {
      return 'Modalidades ainda não carregadas';
    }
    if (!registrations.length) {
      return 'Sem modalidade';
    }
    return registrations
      .map((registration) => registration.categoryName)
      .join(' · ');
  }

  teamModalities(teamId: string) {
    return this.tournamentRead()?.teamSummaries?.find((item) => item.team.id === teamId)?.registrations ?? null;
  }

  statusLabel(status: string): string {
    return (
      {
        DRAFT: 'Rascunho',
        REGISTRATION_OPEN: 'Inscrições abertas',
        REGISTRATION_CLOSED: 'Inscrições encerradas',
        ACTIVE: 'Ativo',
        LIVE: 'Ao vivo',
        FINISHED: 'Finalizado',
        CANCELED: 'Cancelado',
        PENDING: 'Pendente',
        PENDING_APPROVAL: 'Aguardando aprovação',
        APPROVED: 'Aprovado',
        CHANGES_REQUESTED: 'Ajustes solicitados',
        CONFLICT: 'Conflito',
        REJECTED: 'Rejeitado',
        SUSPENDED: 'Suspenso',
        WITHDRAWN: 'Desistiu',
        WAITING_APPROVAL: 'Aguardando aprovação',
        WAITING_PAYMENT: 'Aguardando pagamento',
        UNDER_REVIEW: 'Pagamento em análise',
        PAID: 'Pago',
        NOT_REQUIRED: 'Pagamento não exigido',
        NOT_REQUIRED_YET: 'Pagamento ainda não exigido',
        NOT_AVAILABLE: 'Pagamento indisponível',
        SCHEDULED: 'Agendada',
        CHECK_IN: 'Credenciamento',
        PAUSED: 'Pausada',
        AWAITING_REVIEW: 'Em revisão',
        DRAW: 'Empate',
      }[status] ?? status
    );
  }

  matchStatusLabel(status: string): string {
    return status === 'CANCELED'
      ? 'Cancelada, aguardando reagendamento'
      : this.statusLabel(status);
  }

  private async run(
    fallback: string,
    operation: () => Promise<void>,
    showGlobalLoading = true,
  ): Promise<void> {
    if (showGlobalLoading) {
      this.loading.set(true);
    }
    this.error.set(null);
    try {
      await operation();
    } catch (error) {
      const message = getErrorMessage(error, fallback);
      this.error.set(message);
      this.notify(message, true);
    } finally {
      if (showGlobalLoading) {
        this.loading.set(false);
      }
    }
  }

  private watchTournament(tournamentId: string): void {
    this.liveSubscription?.unsubscribe();
    this.liveSubscription = this.api.watchTournamentReview(tournamentId).subscribe({
      next: () => void this.refreshLiveSnapshot(),
      error: () => {
        this.notify(
          'As atualizações ao vivo foram interrompidas. Reabra o torneio para reconectar.',
          true,
        );
      },
    });
  }

  private async loadMatchRegistrations(review: SportsMatchReview): Promise<void> {
    const ids = [review.match.homeRegistrationId, review.match.awayRegistrationId].filter(
      (id): id is string => Boolean(id),
    );
    const reads = await Promise.all(ids.map((id) => firstValueFrom(this.api.registration(id))));
    this.registrationReads.set(Object.fromEntries(reads.map((read) => [read.registration.id, read])));
    this.lineupSelections.set(
      Object.fromEntries(
        reads.map((read) => {
          const roster = review.rosters.find((item) => item.registrationId === read.registration.id);
          return [
            read.registration.id,
            roster?.entries.map((entry) => entry.registrationMemberId) ?? read.members.map((member) => member.id),
          ];
        }),
      ),
    );
  }

  private async refreshLiveSnapshot(): Promise<void> {
    if (this.liveRefreshRunning) {
      this.liveRefreshQueued = true;
      return;
    }
    const tournamentId = this.tournamentId();
    if (!tournamentId) {
      return;
    }
    this.liveRefreshRunning = true;
    try {
      do {
        this.liveRefreshQueued = false;
        const categoryId = this.selectedCategoryId();
        const teamId = this.selectedTeamId();
        const matchId = this.selectedMatchId();
        const [tournament, applications, category, team, match] = await Promise.all([
          firstValueFrom(this.api.tournament(tournamentId)),
          firstValueFrom(this.api.applicationQueue(tournamentId)),
          categoryId ? firstValueFrom(this.api.category(categoryId)) : Promise.resolve(null),
          teamId ? firstValueFrom(this.api.team(teamId)) : Promise.resolve(null),
          matchId ? firstValueFrom(this.api.matchReview(matchId)) : Promise.resolve(null),
        ]);
        this.tournamentRead.set(tournament);
        this.applications.set(applications);
        if (category) {
          this.categoryRead.set(category);
        }
        if (team) {
          this.teamRead.set(team);
        }
        if (match) {
          this.matchReview.set(match);
        }
      } while (this.liveRefreshQueued);
    } catch (error) {
      this.error.set(getErrorMessage(error, 'Não foi possível aplicar uma atualização ao vivo.'));
    } finally {
      this.liveRefreshRunning = false;
    }
  }

  private notify(message: string, error = false): void {
    this.snackbar.open(message, 'Fechar', {
      duration: error ? 6000 : 3000,
      panelClass: error ? ['snackbar-error'] : undefined,
    });
  }

  private async confirmAction(title: string, message: string): Promise<boolean> {
    return (
      (await firstValueFrom(
        this.dialog
          .open<ConfirmationDialogComponent, unknown, boolean>(ConfirmationDialogComponent, {
            data: {
              title,
              message,
              confirmLabel: 'Excluir',
              tone: 'danger',
            },
          })
          .afterClosed(),
      )) ?? false
    );
  }

  private async askText(
    title: string,
    description: string,
    label: string,
    initialValue = '',
    multiline = false,
  ): Promise<string | null> {
    return (
      (await firstValueFrom(
        this.dialog
          .open<SportsTextDialogComponent, unknown, string>(SportsTextDialogComponent, {
            data: { title, description, label, initialValue, multiline },
            width: '34rem',
          })
          .afterClosed(),
      )) ?? null
    );
  }

  private categoryToForm(category: SportsCategorySummary) {
    return {
      ...category,
      emoji: category.eventGroup?.emoji ?? this.defaultSportEmoji(category.sport),
      customSportName: category.customSportName ?? '',
      division: category.division ?? '',
      registrationStartDate: this.toLocalDate(category.registrationStartDate),
      registrationEndDate: this.toLocalDate(category.registrationEndDate),
      minimumRosterSize: category.minimumRosterSize ?? 0,
      maximumRosterSize: category.maximumRosterSize ?? 0,
      maximumCaptains: category.maximumCaptains ?? 0,
      maximumCoaches: category.maximumCoaches ?? 0,
      allowPlayerMultipleTeams: category.allowPlayerMultipleTeams ?? false,
      maximumPeriods: category.maximumPeriods ?? 0,
      periodLabel: category.periodLabel ?? 'Tempo',
      rulesText: category.rulesText ?? '',
      registrationFormId: category.registrationFormId ?? '',
    };
  }

  private nullableCategoryValues(raw: typeof this.categoryForm.value) {
    return {
      name: raw.name,
      sport: raw.sport,
      customSportName: raw.sport === 'OTHER' ? raw.customSportName || null : null,
      division: raw.division || null,
      format: raw.format,
      status: raw.status,
      registrationStartDate: this.dateOrNull(raw.registrationStartDate),
      registrationEndDate: this.dateOrNull(raw.registrationEndDate),
      minimumRosterSize: raw.minimumRosterSize || null,
      maximumRosterSize: raw.maximumRosterSize || null,
      maximumCaptains: raw.maximumCaptains || null,
      maximumCoaches: raw.maximumCoaches || null,
      allowPlayerMultipleTeams: raw.allowPlayerMultipleTeams,
      periodsEnabled: raw.periodsEnabled,
      maximumPeriods: raw.periodsEnabled ? raw.maximumPeriods || null : null,
      periodLabel: raw.periodsEnabled ? raw.periodLabel || null : null,
      scoreRulesJson: raw.scoreRulesJson,
      rosterRulesJson: raw.rosterRulesJson,
      bracketRulesJson: raw.bracketRulesJson,
      standingsRulesJson: raw.standingsRulesJson,
      rulesText: raw.rulesText || null,
      registrationFormId: raw.registrationFormId || null,
    };
  }

  private dateOrNull(value?: string | null): string | null {
    return value ? new Date(value).toISOString() : null;
  }

  private defaultSportEmoji(sport: string): string {
    return (
      {
        SOCCER: '⚽',
        FUTSAL: '⚽',
        TENNIS: '🎾',
        BASKETBALL: '🏀',
        ESPORTS: '🎮',
        CHESS: '♟️',
        VOLLEYBALL: '🏐',
        SWIMMING: '🏊',
        TABLE_TENNIS: '🏓',
        HANDBALL: '🤾',
      }[sport] ?? '🏅'
    );
  }

  private dateOrUndefined(value?: string | null): string | undefined {
    return value ? new Date(value).toISOString() : undefined;
  }

  private toLocalDate(value?: string | null): string {
    if (!value) {
      return '';
    }
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

}

function jsonObjectValidator(control: AbstractControl<string>): ValidationErrors | null {
  if (control.value.length > 20_000) {
    return { jsonTooLarge: true };
  }
  try {
    const parsed: unknown = JSON.parse(control.value || '{}');
    if (!isPlainObject(parsed)) {
      return { jsonObject: true };
    }
    if (!isSafeJson(parsed, 0)) {
      return { jsonUnsafe: true };
    }
    return null;
  } catch {
    return { json: true };
  }
}

function scoreRulesValidator(control: AbstractControl<string>): ValidationErrors | null {
  const base = jsonObjectValidator(control);
  if (base) {
    return base;
  }
  const parsed = JSON.parse(control.value || '{}') as Record<string, unknown>;
  const allowedKeys = new Set(['strategy', 'allowDraw', 'higherWins', 'pointStep']);
  if (Object.keys(parsed).some((key) => !allowedKeys.has(key))) {
    return { scoreRuleKey: true };
  }
  if (
    parsed['strategy'] !== undefined &&
    !['TOTAL', 'SETS', 'ROUNDS', 'PLACEMENT', 'CUSTOM'].includes(String(parsed['strategy']))
  ) {
    return { scoreStrategy: true };
  }
  if (parsed['allowDraw'] !== undefined && typeof parsed['allowDraw'] !== 'boolean') {
    return { scoreAllowDraw: true };
  }
  if (parsed['higherWins'] !== undefined && typeof parsed['higherWins'] !== 'boolean') {
    return { scoreHigherWins: true };
  }
  if (
    parsed['pointStep'] !== undefined &&
    (typeof parsed['pointStep'] !== 'number' || !Number.isFinite(parsed['pointStep']) || parsed['pointStep'] <= 0)
  ) {
    return { scorePointStep: true };
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeJson(value: unknown, depth: number): boolean {
  if (depth > 6) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.length <= 100 && value.every((item) => isSafeJson(item, depth + 1));
  }
  if (!isPlainObject(value)) {
    return typeof value !== 'number' || Number.isFinite(value);
  }
  const entries = Object.entries(value);
  return (
    entries.length <= 100 &&
    entries.every(
      ([key, item]) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) && isSafeJson(item, depth + 1),
    )
  );
}
