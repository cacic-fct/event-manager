import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { SportsSelfSubscriptionPage } from './self-subscription-page';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { createCurrentUserTournamentOperations } from './sports-operations.fixtures';

describe('SportsSelfSubscriptionPage', () => {
  const open = vi.fn();
  const submitApplication = vi.fn(() => of({ id: 'application-fixture' }));
  const tournament = vi.fn(() => of(createCurrentUserTournamentOperations()));

  beforeEach(() => {
    open.mockReset();
    submitApplication.mockReset();
    submitApplication.mockReturnValue(of({ id: 'application-fixture' }));
    tournament.mockReset();
    tournament.mockReturnValue(of(createCurrentUserTournamentOperations()));
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ tournamentId: 'tournament-fixture' }) } },
        },
        { provide: MatSnackBar, useValue: { open } },
        { provide: SportsOperationsApiService, useValue: { tournament, submitApplication } },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('loads shared fixture data and applies tournament-specific validators', () => {
    const page = TestBed.runInInjectionContext(() => new SportsSelfSubscriptionPage());
    page.ngOnInit();

    expect(tournament).toHaveBeenCalledWith('tournament-fixture');
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
});
