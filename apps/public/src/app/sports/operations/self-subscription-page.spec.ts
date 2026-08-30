import { By } from '@angular/platform-browser';
import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { publicFixtureDateFromNow } from '@cacic-fct/event-manager-public-testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink, convertToParamMap, provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { SportsSelfSubscriptionPage } from './self-subscription-page';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { SportsOperationsRealtimeService } from './sports-operations-realtime.service';
import { createCurrentUserTournamentOperations } from './sports-operations.fixtures';
import type {
  CurrentUserSportsPlayerApplication,
} from './sports-operations.types';
import type { SportsOperationsApplicationInvalidation } from './sports-operations-realtime.service';

describe('SportsSelfSubscriptionPage', () => {
  const open = vi.fn();
  const submitApplication = vi.fn(() => of({ id: 'application-fixture' }));
  const currentUserApplications = vi.fn(() => of([] as CurrentUserSportsPlayerApplication[]));
  const tournament = vi.fn((...args: [tournamentId?: string, requestedTeamId?: string | null]) => {
    void args;
    return of(createCurrentUserTournamentOperations());
  });
  let realtimeStreams: Subject<SportsOperationsApplicationInvalidation>[];
  let watchCurrentUserApplications: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    open.mockReset();
    submitApplication.mockReset();
    submitApplication.mockReturnValue(of({ id: 'application-fixture' }));
    currentUserApplications.mockReset();
    currentUserApplications.mockReturnValue(of([]));
    tournament.mockReset();
    tournament.mockReturnValue(of(createCurrentUserTournamentOperations()));
    realtimeStreams = [];
    watchCurrentUserApplications = vi.fn(() => {
      const stream = new Subject<SportsOperationsApplicationInvalidation>();
      realtimeStreams.push(stream);
      return stream;
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: PLATFORM_ID, useValue: 'browser' },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ tournamentId: 'tournament-fixture' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        { provide: MatSnackBar, useValue: { open } },
        { provide: SportsOperationsApiService, useValue: { tournament, currentUserApplications, submitApplication } },
        { provide: SportsOperationsRealtimeService, useValue: { watchCurrentUserApplications } },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('loads shared fixture data and applies tournament-specific validators', () => {
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    expect(currentUserApplications).toHaveBeenCalledWith('tournament-fixture');
    expect(tournament).toHaveBeenCalledWith('tournament-fixture', null);
    expect(page.loading()).toBe(false);
    expect(page.form.controls.requestedTeamId.hasError('required')).toBe(true);
    expect(page.form.controls.paymentTier.hasError('required')).toBe(true);
    expect(page.form.controls.imageLicenseAgreementAccepted.hasError('required')).toBe(true);
    expect(page.selectedTeam()).toBeUndefined();

    const data = page.data();
    if (!data) throw new Error('Expected tournament fixture data.');
    const team = data.tournament.teams[0];
    if (!team) throw new Error('Expected a team fixture.');
    page.form.controls.requestedTeamId.setValue(team.id);
    expect(page.selectedTeam()).toEqual(team);
    const category = data.tournament.categories[0];
    if (!category) throw new Error('Expected a category fixture.');
    page.toggleCategory(category.id, true);
    expect(page.selectedCategories().size).toBe(1);
    page.toggleCategory(category.id, false);
    expect(page.selectedCategories().size).toBe(0);
  });

  it('replaces the subscription history entry when returning to the tournament', async () => {
    TestBed.configureTestingModule({
      imports: [SportsSelfSubscriptionPage],
      providers: [provideRouter([])],
    });
    await TestBed.compileComponents();

    const fixture = TestBed.createComponent(SportsSelfSubscriptionPage);
    fixture.detectChanges();

    const toolbarLink = fixture.debugElement.query(By.css('a[aria-label="Voltar ao torneio"]'));
    expect(toolbarLink.injector.get(RouterLink).replaceUrl).toBe(true);

    fixture.componentInstance.submitted.set(true);
    fixture.detectChanges();

    const successLink = fixture.debugElement.query(By.css('a[mat-flat-button]'));
    expect(successLink.injector.get(RouterLink).replaceUrl).toBe(true);
    fixture.destroy();
  });

  it('prefills an editable pending application and changes the submit action', () => {
    const data = createCurrentUserTournamentOperations();
    const category = data.tournament.categories[1];
    if (!category) throw new Error('Expected a category fixture.');
    currentUserApplications.mockReturnValue(
      of([
        {
          id: 'application-pending',
          tournamentId: 'tournament-fixture',
          requestedTeam: data.tournament.teams[0] ?? null,
          categories: [category],
          status: 'PENDING',
          paymentTier: 'Estudante',
          imageLicenseAgreementAccepted: true,
          reviewMessage: null,
        },
      ]),
    );
    tournament.mockReturnValue(of(data));
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    expect(tournament).toHaveBeenCalledWith('tournament-fixture', 'team-home');
    expect(page.isEditing()).toBe(true);
    expect(page.form.getRawValue()).toEqual(
      expect.objectContaining({
        requestedTeamId: 'team-home',
        noticeAccepted: true,
        imageLicenseAgreementAccepted: true,
        paymentTier: 'Estudante',
      }),
    );
    expect(page.selectedCategories()).toEqual(new Set([category.id]));
    expect(page.submitButtonLabel()).toBe('Salvar edição');
  });

  it('allows a new independent request after a rejected application', async () => {
    const data = createCurrentUserTournamentOperations({
      paymentRequired: false,
      requiresImageLicenseAgreement: false,
    });
    currentUserApplications.mockReturnValue(
      of([
        {
          id: 'application-rejected',
          tournamentId: 'tournament-fixture',
          requestedTeam: data.tournament.teams[0] ?? null,
          categories: data.tournament.categories.slice(0, 1),
          status: 'REJECTED',
          paymentTier: null,
          imageLicenseAgreementAccepted: true,
          reviewMessage: 'Revise a modalidade escolhida.',
        },
      ]),
    );
    tournament.mockReturnValue(of(data));
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    expect(page.application()).toBeNull();
    expect(page.previousApplication()?.id).toBe('application-rejected');
    expect(page.form.enabled).toBe(true);
    expect(page.form.controls.requestedTeamId.value).toBe(data.tournament.teams[0]?.id);
    expect(page.selectedCategories()).toEqual(new Set([data.tournament.categories[0]?.id]));

    const category = data.tournament.categories[0];
    if (!category) throw new Error('Expected a category fixture.');
    page.form.controls.requestedTeamId.setValue(data.tournament.teams[0]?.id ?? '');
    page.form.controls.noticeAccepted.setValue(true);
    page.toggleCategory(category.id, true);
    await page.submit();

    expect(submitApplication).toHaveBeenCalledWith(expect.objectContaining({ applicationId: null }));
  });

  it('reloads categories for the selected team before allowing submission', () => {
    const allCategories = createCurrentUserTournamentOperations({
      paymentRequired: false,
      requiresImageLicenseAgreement: false,
    });
    tournament.mockImplementation((_tournamentId, requestedTeamId) =>
      of(
        requestedTeamId === 'team-home'
          ? {
              ...allCategories,
              tournament: { ...allCategories.tournament, categories: [] },
            }
          : allCategories,
      ),
    );
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    page.form.controls.requestedTeamId.setValue('team-home');
    page.form.controls.noticeAccepted.setValue(true);
    const category = allCategories.tournament.categories[0];
    if (!category) throw new Error('Expected a category fixture.');
    page.toggleCategory(category.id, true);
    expect(page.canSubmit()).toBe(true);
    page.teamSelectionChanged('team-home');

    expect(tournament).toHaveBeenLastCalledWith('tournament-fixture', 'team-home');
    expect(page.data()?.tournament.categories).toEqual([]);
    expect(page.selectedCategories().size).toBe(0);
    expect(page.canSubmit()).toBe(false);
  });

  it('ignores a late tournament response for a previously selected team', () => {
    const firstResponse = new Subject<ReturnType<typeof createCurrentUserTournamentOperations>>();
    const secondResponse = new Subject<ReturnType<typeof createCurrentUserTournamentOperations>>();
    tournament.mockImplementation((_tournamentId, requestedTeamId) =>
      requestedTeamId === 'team-home' ? secondResponse : firstResponse,
    );
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    page.teamSelectionChanged('team-home');

    const latest = createCurrentUserTournamentOperations({ empty: true });
    secondResponse.next(latest);
    expect(page.data()?.tournament.teams).toEqual([]);

    firstResponse.next(createCurrentUserTournamentOperations());

    expect(page.data()?.tournament.teams).toEqual([]);
  });

  it('submits normalized optional values only after all agreements are satisfied', async () => {
    tournament.mockReturnValue(
      of(
        createCurrentUserTournamentOperations({
          allowNoTeam: true,
          paymentRequired: false,
          requiresImageLicenseAgreement: false,
        }),
      ),
    );
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    const data = page.data();
    if (!data) throw new Error('Expected tournament fixture data.');
    const category = data.tournament.categories[0];
    if (!category) throw new Error('Expected a category fixture.');
    page.form.controls.noticeAccepted.setValue(true);
    page.form.controls.requestedTeamId.setValue('   ');
    page.toggleCategory(category.id, true);

    expect(page.canSubmit()).toBe(true);
    await page.submit();

    expect(submitApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        tournamentId: data.tournament.id,
        requestedTeamId: null,
        paymentTier: null,
        noticeAccepted: true,
        categoryIds: [category.id],
        pendingKey: expect.any(String),
      }),
    );
    expect(page.submitted()).toBe(true);
    expect(page.busy()).toBe(false);
  });

  it('locks the tier handed off by an event subscription and continues to its safe return URL', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        snapshot: {
          paramMap: convertToParamMap({ tournamentId: 'tournament-fixture' }),
          queryParamMap: convertToParamMap({
            paymentTier: 'Estudante',
            returnUrl: '/major-event/major-1/payment',
          }),
        },
      },
    });
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    const data = page.data();
    if (!data) throw new Error('Expected tournament fixture data.');
    const team = data.tournament.teams[0];
    const category = data.tournament.categories[0];
    if (!team || !category) throw new Error('Expected tournament options.');
    page.form.controls.requestedTeamId.setValue(team.id);
    page.form.controls.noticeAccepted.setValue(true);
    page.form.controls.imageLicenseAgreementAccepted.setValue(true);
    page.toggleCategory(category.id, true);

    expect(page.paymentTierLocked()).toBe(true);
    expect(page.form.controls.paymentTier.disabled).toBe(true);
    expect(page.form.getRawValue().paymentTier).toBe('Estudante');

    await page.submit();

    expect(navigateByUrl).toHaveBeenCalledWith('/major-event/major-1/payment', { replaceUrl: true });
  });

  it('guides missing category selection and reports load and submission failures', async () => {
    tournament.mockReturnValue(
      of(
        createCurrentUserTournamentOperations({
          allowNoTeam: true,
          paymentRequired: false,
          requiresImageLicenseAgreement: false,
        }),
      ),
    );
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    const data = page.data();
    if (!data) throw new Error('Expected tournament fixture data.');
    const category = data.tournament.categories[0];
    if (!category) throw new Error('Expected a category fixture.');
    await page.submit();
    expect(open).toHaveBeenCalledWith('Escolha pelo menos uma modalidade.', 'Fechar', { duration: 4000 });

    page.form.controls.noticeAccepted.setValue(true);
    page.toggleCategory(category.id, true);
    submitApplication.mockReturnValueOnce(throwError(() => new Error('Inscrição recusada')));
    await page.submit();
    expect(open).toHaveBeenCalledWith('Inscrição recusada', 'Fechar', { duration: 6000 });

    tournament.mockReturnValueOnce(throwError(() => 'offline'));
    page.load();
    expect(page.error()).toBe('Não foi possível abrir a inscrição.');
    expect(page.loading()).toBe(false);
  });

  it('does not open the authenticated realtime stream during server rendering', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());

    page.ngOnInit();

    expect(watchCurrentUserApplications).not.toHaveBeenCalled();
  });

  it('coalesces application updates and preserves an editable draft', async () => {
    vi.useFakeTimers();
    const data = createCurrentUserTournamentOperations();
    const category = data.tournament.categories[1];
    const application: CurrentUserSportsPlayerApplication = {
      id: 'application-pending',
      tournamentId: 'tournament-fixture',
      requestedTeam: data.tournament.teams[0] ?? null,
      categories: data.tournament.categories.slice(0, 1),
      status: 'PENDING',
      participantStatus: 'PENDING',
      paymentStatus: 'WAITING_APPROVAL',
      paymentTier: 'Estudante',
      imageLicenseAgreementAccepted: true,
      reviewedAt: null,
      reviewMessage: null,
    };
    currentUserApplications.mockReturnValueOnce(of([application])).mockReturnValueOnce(
      of([{ ...application, paymentStatus: 'PAID' }]),
    );
    tournament.mockReturnValue(of(data));
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    if (!category) throw new Error('Expected a category fixture.');

    page.form.controls.requestedTeamId.setValue('team-away');
    page.toggleCategory(category.id, true);
    realtimeStreams[0]?.next({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: application.id,
      tournamentId: 'tournament-fixture',
      reason: 'REVIEWED',
    });
    realtimeStreams[0]?.next({
      type: 'SPORTS_PARTICIPANT_PAYMENT_CHANGED',
      tournamentId: 'tournament-fixture',
      subscriptionId: 'subscription-1',
      reason: 'PAYMENT_APPROVED',
      subscriptionStatus: 'CONFIRMED',
      participantStatus: 'ACTIVE',
      paymentStatus: 'PAID',
      applications: [{ id: application.id, status: 'PENDING' }],
      occurredAt: publicFixtureDateFromNow(0, 12),
    });
    await vi.advanceTimersByTimeAsync(75);

    expect(currentUserApplications).toHaveBeenCalledTimes(2);
    expect(tournament).toHaveBeenCalledTimes(2);
    expect(page.application()?.paymentStatus).toBe('PAID');
    expect(page.form.controls.requestedTeamId.value).toBe('team-away');
    expect(page.selectedCategories()).toEqual(new Set(['futsal-open', category.id]));
  });

  it('discards the editable draft when the authoritative application becomes read-only', async () => {
    vi.useFakeTimers();
    const data = createCurrentUserTournamentOperations();
    const pending: CurrentUserSportsPlayerApplication = {
      id: 'application-pending',
      tournamentId: 'tournament-fixture',
      requestedTeam: data.tournament.teams[0] ?? null,
      categories: data.tournament.categories.slice(0, 1),
      status: 'PENDING',
      paymentTier: 'Estudante',
      imageLicenseAgreementAccepted: true,
      reviewMessage: null,
    };
    const approved = { ...pending, status: 'APPROVED' as const, paymentStatus: 'PAID' };
    currentUserApplications.mockReturnValueOnce(of([pending])).mockReturnValueOnce(of([approved]));
    tournament.mockReturnValue(of(data));
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    page.form.controls.requestedTeamId.setValue('team-away');
    page.toggleCategory('volleyball-mixed', true);
    realtimeStreams[0]?.next({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: pending.id,
      tournamentId: 'tournament-fixture',
      reason: 'REVIEWED',
      status: 'APPROVED',
    });
    await vi.advanceTimersByTimeAsync(75);

    expect(page.application()?.status).toBe('APPROVED');
    expect(page.form.disabled).toBe(true);
    expect(page.form.controls.requestedTeamId.value).toBe('team-home');
    expect(page.selectedCategories()).toEqual(new Set(['futsal-open']));
  });

  it('lets the newest invalidation refresh win over an older in-flight refresh', async () => {
    vi.useFakeTimers();
    const firstApplications = new Subject<CurrentUserSportsPlayerApplication[]>();
    const secondApplications = new Subject<CurrentUserSportsPlayerApplication[]>();
    const firstTournament = new Subject<ReturnType<typeof createCurrentUserTournamentOperations>>();
    const secondTournament = new Subject<ReturnType<typeof createCurrentUserTournamentOperations>>();
    const latest = createCurrentUserTournamentOperations({ empty: true });
    currentUserApplications
      .mockReturnValueOnce(of([]))
      .mockReturnValueOnce(firstApplications)
      .mockReturnValueOnce(secondApplications);
    tournament
      .mockReturnValueOnce(of(createCurrentUserTournamentOperations()))
      .mockReturnValueOnce(firstTournament)
      .mockReturnValueOnce(secondTournament);
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    realtimeStreams[0]?.next({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: 'application-1',
      tournamentId: 'tournament-fixture',
      reason: 'REVIEWED',
    });
    await vi.advanceTimersByTimeAsync(75);
    realtimeStreams[0]?.next({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: 'application-2',
      tournamentId: 'tournament-fixture',
      reason: 'REVIEWED',
    });
    await vi.advanceTimersByTimeAsync(75);

    secondApplications.next([]);
    secondApplications.complete();
    secondTournament.next(latest);
    secondTournament.complete();
    firstApplications.next([
      {
        id: 'stale-application',
        tournamentId: 'tournament-fixture',
        requestedTeam: null,
        categories: [],
        status: 'APPROVED',
        imageLicenseAgreementAccepted: false,
        reviewMessage: null,
      },
    ]);
    firstApplications.complete();
    firstTournament.next(createCurrentUserTournamentOperations());
    firstTournament.complete();

    expect(page.data()?.tournament.teams).toEqual([]);
    expect(page.application()).toBeNull();
  });

  it('recovers the authenticated snapshot and reconnects after a terminal SSE failure', () => {
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    const firstStream = realtimeStreams[0];
    if (!firstStream) throw new Error('Expected the initial realtime subscription.');

    firstStream.error(new Error('closed'));

    expect(currentUserApplications).toHaveBeenCalledTimes(2);
    expect(tournament).toHaveBeenCalledTimes(2);
    expect(watchCurrentUserApplications).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith(
      'A conexão em tempo real foi interrompida. Atualizando sua inscrição…',
      'Fechar',
      { duration: 5000 },
    );
    expect(realtimeStreams).toHaveLength(2);
  });

  it('retains the last good application and draft when authenticated recovery fails', () => {
    const data = createCurrentUserTournamentOperations();
    const application: CurrentUserSportsPlayerApplication = {
      id: 'application-pending',
      tournamentId: 'tournament-fixture',
      requestedTeam: data.tournament.teams[0] ?? null,
      categories: data.tournament.categories.slice(0, 1),
      status: 'PENDING',
      paymentTier: 'Estudante',
      imageLicenseAgreementAccepted: true,
      reviewMessage: null,
    };
    currentUserApplications.mockReturnValueOnce(of([application])).mockReturnValueOnce(
      throwError(() => new Error('offline')),
    );
    tournament.mockReturnValue(of(data));
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    page.form.controls.requestedTeamId.setValue('team-away');
    const firstStream = realtimeStreams[0];
    if (!firstStream) throw new Error('Expected the initial realtime subscription.');

    firstStream.error(new Error('closed'));

    expect(page.application()?.id).toBe(application.id);
    expect(page.form.controls.requestedTeamId.value).toBe('team-away');
    expect(watchCurrentUserApplications).toHaveBeenCalledTimes(2);
    expect(open).toHaveBeenCalledWith(
      'Não foi possível atualizar sua inscrição. Os últimos dados continuam disponíveis.',
      'Fechar',
      { duration: 6000 },
    );
  });

  it('unsubscribes from realtime events when destroyed', () => {
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();
    const stream = realtimeStreams[0];
    if (!stream) throw new Error('Expected the initial realtime subscription.');

    page.ngOnDestroy();
    stream.next({
      type: 'SPORTS_PLAYER_APPLICATION_CHANGED',
      applicationId: 'application-1',
      tournamentId: 'tournament-fixture',
      reason: 'REVIEWED',
    });

    expect(currentUserApplications).toHaveBeenCalledTimes(1);
  });
});
