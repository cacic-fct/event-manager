import { CurrencyPipe, isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { SportsTeamLogoComponent, TwemojiComponent } from '@cacic-fct/shared-angular';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, finalize, forkJoin, firstValueFrom } from 'rxjs';
import { SportsOperationsApiService } from './sports-operations-api.service';
import type {
  SportsOperationsApplicationInvalidation,
} from './sports-operations-realtime.service';
import { SportsOperationsRealtimeService } from './sports-operations-realtime.service';
import {
  CurrentUserSportsPlayerApplication,
  CurrentUserTournamentOperations,
} from './sports-operations.types';
import { resolveInternalReturnUrl } from '../../shared/internal-return-url';

const EDITABLE_APPLICATION_STATUSES = ['PENDING', 'CHANGES_REQUESTED'] as const;
const ACTIVE_APPLICATION_STATUSES = ['APPROVED', 'WAITING_PAYMENT', 'ACTIVE'] as const;
const RETRYABLE_APPLICATION_STATUSES = ['REJECTED', 'WITHDRAWN'] as const;

@Component({
  selector: 'app-sports-self-subscription-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    MatToolbarModule,
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    SportsTeamLogoComponent,
    TwemojiComponent,
  ],
  templateUrl: './self-subscription-page.html',
  styleUrl: './self-subscription-page.css',
})
export class SportsSelfSubscriptionPage implements OnInit, OnDestroy {
  private readonly api = inject(SportsOperationsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly realtime = inject(SportsOperationsRealtimeService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly realtimeInvalidations = new Subject<SportsOperationsApplicationInvalidation>();

  readonly data = signal<CurrentUserTournamentOperations | null>(null);
  readonly application = signal<CurrentUserSportsPlayerApplication | null>(null);
  readonly previousApplication = signal<CurrentUserSportsPlayerApplication | null>(null);
  readonly selectedCategories = signal<Set<string>>(new Set());
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly paymentTierLocked = signal(false);
  readonly error = signal<string | null>(null);
  private readonly formRevision = signal(0);
  private applicationLoaded = false;
  private applicationRequestId = 0;
  private realtimeRefreshRequestId = 0;
  private realtimeRecoveryInFlight = false;
  private realtimeRecoveryAttempted = false;
  private realtimeSubscription?: Subscription;
  private destroyed = false;
  readonly isEditing = computed(() => {
    const status = this.application()?.status;
    return status
      ? EDITABLE_APPLICATION_STATUSES.includes(status as (typeof EDITABLE_APPLICATION_STATUSES)[number])
      : false;
  });
  readonly applicationIsReadOnly = computed(() => Boolean(this.application()) && !this.isEditing());
  readonly submitButtonLabel = computed(() => {
    if (this.busy()) {
      return this.isEditing() ? 'Salvando…' : 'Enviando…';
    }
    if (this.applicationIsReadOnly()) {
      return 'Solicitação encerrada';
    }
    return this.isEditing() ? 'Salvar edição' : 'Enviar solicitação';
  });
  readonly canSubmit = computed(() => {
    this.formRevision();
    const tournament = this.data()?.tournament;
    return Boolean(
      tournament &&
        !this.loading() &&
        !this.busy() &&
        !this.applicationIsReadOnly() &&
        this.form.valid &&
        (tournament.selfSubscriptionAllowNoCategory || this.selectedCategories().size > 0),
    );
  });

  readonly form = new FormGroup({
    requestedTeamId: new FormControl('', { nonNullable: true }),
    noticeAccepted: new FormControl(false, { nonNullable: true, validators: Validators.requiredTrue }),
    imageLicenseAgreementAccepted: new FormControl(false, { nonNullable: true }),
    paymentTier: new FormControl('', { nonNullable: true }),
  });

  protected tournamentId = '';
  private requestedPaymentTier: string | null = null;
  private returnUrl: string | null = null;
  private tournamentRequestId = 0;

  constructor() {
    this.form.valueChanges.subscribe(() => this.formRevision.update((revision) => revision + 1));
    this.realtimeInvalidations
      .pipe(debounceTime(75), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refreshAfterRealtimeInvalidation());
  }

  ngOnInit(): void {
    this.tournamentId = this.route.snapshot.paramMap.get('tournamentId') ?? '';
    this.requestedPaymentTier = this.route.snapshot.queryParamMap.get('paymentTier')?.trim() || null;
    this.returnUrl = resolveInternalReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl'), '') || null;
    this.load();
    if (this.isBrowser && this.tournamentId) {
      this.watchCurrentUserApplications();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.realtimeSubscription?.unsubscribe();
    this.realtimeInvalidations.complete();
  }

  load(requestedTeamId: string | null = this.form.controls.requestedTeamId.value.trim() || null): void {
    this.realtimeRefreshRequestId++;
    this.realtimeRecoveryAttempted = false;
    this.loading.set(true);
    if (!this.applicationLoaded) {
      const requestId = ++this.applicationRequestId;
      this.api.currentUserApplications(this.tournamentId).subscribe({
        next: (applications) => {
          if (requestId !== this.applicationRequestId) {
            return;
          }
          this.applicationLoaded = true;
          this.initializeApplication(applications);
          this.loadTournament(this.form.controls.requestedTeamId.value.trim() || null);
        },
        error: (error: unknown) => {
          if (requestId === this.applicationRequestId) {
            this.setLoadError(error);
          }
        },
      });
      return;
    }
    this.loadTournament(requestedTeamId);
  }

  private loadTournament(requestedTeamId: string | null, preserveDraft = false): void {
    const requestId = ++this.tournamentRequestId;
    this.api.tournament(this.tournamentId, requestedTeamId).subscribe({
      next: (data) => {
        if (requestId !== this.tournamentRequestId) {
          return;
        }
        this.applyTournamentData(data, preserveDraft);
      },
      error: (error: unknown) => {
        if (requestId === this.tournamentRequestId) {
          this.setLoadError(error);
        }
      },
    });
  }

  private initializeApplication(applications: CurrentUserSportsPlayerApplication[]): void {
    this.applyApplications(applications, false);
  }

  private applyApplications(applications: CurrentUserSportsPlayerApplication[], preserveDraft: boolean): void {
    const previousApplication = this.application();
    const application = this.selectApplication(applications);
    const previousWasReadOnly = isReadOnlyApplication(previousApplication);
    const matchingPreviousApplication = previousApplication
      ? applications.find((item) => item.id === previousApplication.id)
      : undefined;
    const nextIsReadOnly =
      isReadOnlyApplication(application) ||
      Boolean(previousApplication && (!matchingPreviousApplication || !isEditableApplication(matchingPreviousApplication)));

    this.previousApplication.set(
      applications.find((item) =>
        RETRYABLE_APPLICATION_STATUSES.includes(item.status as (typeof RETRYABLE_APPLICATION_STATUSES)[number]),
      ) ?? null,
    );
    this.application.set(application);

    if (preserveDraft && !previousWasReadOnly && !nextIsReadOnly) {
      this.form.enable({ emitEvent: false });
      if (this.paymentTierLocked()) {
        this.form.controls.paymentTier.disable({ emitEvent: false });
      }
      return;
    }

    const initialApplication = application ?? this.previousApplication();
    this.selectedCategories.set(new Set(initialApplication?.categories.map((category) => category.id) ?? []));
    this.form.enable({ emitEvent: false });
    this.paymentTierLocked.set(false);
    if (!initialApplication) {
      return;
    }
    this.form.patchValue(
      {
        requestedTeamId: initialApplication.requestedTeam?.id ?? '',
        noticeAccepted: Boolean(application),
        imageLicenseAgreementAccepted: initialApplication.imageLicenseAgreementAccepted,
        paymentTier: initialApplication.paymentTier ?? '',
      },
      { emitEvent: false },
    );
    if (application && !this.isEditing()) {
      this.form.disable({ emitEvent: false });
    }
  }

  private selectApplication(
    applications: CurrentUserSportsPlayerApplication[],
  ): CurrentUserSportsPlayerApplication | null {
    return (
      applications.find((item) =>
        EDITABLE_APPLICATION_STATUSES.includes(item.status as (typeof EDITABLE_APPLICATION_STATUSES)[number]),
      ) ??
      applications.find((item) =>
        ACTIVE_APPLICATION_STATUSES.includes(item.status as (typeof ACTIVE_APPLICATION_STATUSES)[number]),
      ) ??
      null
    );
  }

  private applyTournamentData(data: CurrentUserTournamentOperations, preserveDraft: boolean): void {
    this.data.set(data);
    const keepDraft = preserveDraft && !this.applicationIsReadOnly();
    const requestedTeam = this.form.controls.requestedTeamId;
    if (data.tournament.selfSubscriptionAllowNoTeam) {
      requestedTeam.clearValidators();
    } else {
      requestedTeam.addValidators(Validators.required);
    }
    requestedTeam.updateValueAndValidity();

    const paymentTier = this.form.controls.paymentTier;
    if (data.tournament.isPaymentRequired) {
      paymentTier.addValidators(Validators.required);
      if (!keepDraft) {
        const requestedTier = data.tournament.paymentTiers.find((tier) => tier.name === this.requestedPaymentTier);
        if (!this.application() && requestedTier) {
          paymentTier.setValue(requestedTier.name, { emitEvent: false });
          paymentTier.disable({ emitEvent: false });
          this.paymentTierLocked.set(true);
        } else if (data.tournament.paymentTiers.length === 1) {
          paymentTier.setValue(data.tournament.paymentTiers[0].name, { emitEvent: false });
        } else if (data.tournament.paymentTiers.length === 0) {
          paymentTier.setValue('', { emitEvent: false });
        }
      }
    } else {
      paymentTier.clearValidators();
      paymentTier.setValue('', { emitEvent: false });
    }
    paymentTier.updateValueAndValidity();

    const imageLicenseAgreement = this.form.controls.imageLicenseAgreementAccepted;
    imageLicenseAgreement.setValue(data.imageLicenseAgreementAccepted || imageLicenseAgreement.value, {
      emitEvent: false,
    });
    imageLicenseAgreement.setValidators(
      data.tournament.requiresImageLicenseAgreement ? Validators.requiredTrue : [],
    );
    imageLicenseAgreement.updateValueAndValidity();
    const availableCategoryIds = new Set(data.tournament.categories.map((category) => category.id));
    this.selectedCategories.update((current) => {
      return new Set([...current].filter((categoryId) => availableCategoryIds.has(categoryId)));
    });
    this.loading.set(false);
    this.error.set(null);
  }

  private watchCurrentUserApplications(): void {
    this.realtimeSubscription?.unsubscribe();
    this.realtimeSubscription = this.realtime
      .watchCurrentUserApplications()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (invalidation) => {
          if (!this.destroyed && invalidation.tournamentId === this.tournamentId) {
            this.realtimeRecoveryAttempted = false;
            this.realtimeInvalidations.next(invalidation);
          }
        },
        error: () => {
          this.realtimeSubscription = undefined;
          if (this.destroyed || this.realtimeRecoveryInFlight) {
            return;
          }
          if (this.realtimeRecoveryAttempted) {
            this.snackbar.open('A conexão em tempo real continua indisponível. Tente novamente.', 'Fechar', {
              duration: 6000,
            });
            return;
          }
          this.realtimeRecoveryAttempted = true;
          this.snackbar.open(
            'A conexão em tempo real foi interrompida. Atualizando sua inscrição…',
            'Fechar',
            { duration: 5000 },
          );
          this.recoverAfterRealtimeFailure();
        },
      });
  }

  private refreshAfterRealtimeInvalidation(): void {
    if (this.destroyed || !this.tournamentId || this.realtimeRecoveryInFlight) {
      return;
    }

    const refreshRequestId = ++this.realtimeRefreshRequestId;
    const applicationRequestId = ++this.applicationRequestId;
    const tournamentRequestId = ++this.tournamentRequestId;
    const requestedTeamId = this.currentRequestedTeamId();
    const preserveDraft = !this.applicationIsReadOnly();

    forkJoin({
      applications: this.api.currentUserApplications(this.tournamentId),
      tournament: this.api.tournament(this.tournamentId, requestedTeamId),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ applications, tournament }) => {
          if (refreshRequestId !== this.realtimeRefreshRequestId) {
            return;
          }
          this.applicationLoaded = true;
          if (applicationRequestId === this.applicationRequestId) {
            this.applyApplications(applications, preserveDraft);
          }
          if (
            tournamentRequestId === this.tournamentRequestId &&
            requestedTeamId === this.currentRequestedTeamId()
          ) {
            this.applyTournamentData(tournament, preserveDraft);
          }
        },
        error: () => {
          if (refreshRequestId === this.realtimeRefreshRequestId) {
            this.showRealtimeRefreshError();
          }
        },
      });
  }

  private recoverAfterRealtimeFailure(): void {
    if (this.realtimeRecoveryInFlight || this.destroyed || !this.tournamentId) {
      return;
    }

    this.realtimeRecoveryInFlight = true;
    const refreshRequestId = ++this.realtimeRefreshRequestId;
    const applicationRequestId = ++this.applicationRequestId;
    const tournamentRequestId = ++this.tournamentRequestId;
    const requestedTeamId = this.currentRequestedTeamId();
    const preserveDraft = !this.applicationIsReadOnly();

    forkJoin({
      applications: this.api.currentUserApplications(this.tournamentId),
      tournament: this.api.tournament(this.tournamentId, requestedTeamId),
    })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.realtimeRecoveryInFlight = false;
          if (!this.destroyed && this.tournamentId) {
            this.watchCurrentUserApplications();
          }
        }),
      )
      .subscribe({
        next: ({ applications, tournament }) => {
          if (refreshRequestId !== this.realtimeRefreshRequestId) {
            return;
          }
          this.applicationLoaded = true;
          if (applicationRequestId === this.applicationRequestId) {
            this.applyApplications(applications, preserveDraft);
          }
          if (
            tournamentRequestId === this.tournamentRequestId &&
            requestedTeamId === this.currentRequestedTeamId()
          ) {
            this.applyTournamentData(tournament, preserveDraft);
          }
        },
        error: () => this.showRealtimeRefreshError(),
      });
  }

  private currentRequestedTeamId(): string | null {
    return this.form.controls.requestedTeamId.value.trim() || null;
  }

  private showRealtimeRefreshError(): void {
    this.snackbar.open(
      'Não foi possível atualizar sua inscrição. Os últimos dados continuam disponíveis.',
      'Fechar',
      { duration: 6000 },
    );
  }

  private setLoadError(error: unknown): void {
    this.loading.set(false);
    this.error.set(error instanceof Error ? error.message : 'Não foi possível abrir a inscrição.');
  }

  teamSelectionChanged(requestedTeamId: string): void {
    if (this.applicationIsReadOnly()) {
      return;
    }
    this.realtimeRefreshRequestId++;
    this.selectedCategories.set(new Set());
    this.loadTournament(requestedTeamId.trim() || null);
  }

  toggleCategory(categoryId: string, selected: boolean): void {
    if (this.applicationIsReadOnly()) {
      return;
    }
    this.selectedCategories.update((current) => {
      const next = new Set(current);
      if (selected) {
        next.add(categoryId);
      } else {
        next.delete(categoryId);
      }
      return next;
    });
  }

  selectedTeam(): CurrentUserTournamentOperations['tournament']['teams'][number] | undefined {
    const selectedTeamId = this.form.controls.requestedTeamId.value;
    return this.data()?.tournament.teams.find((team) => team.id === selectedTeamId);
  }

  applicationStatusLabel(status: CurrentUserSportsPlayerApplication['status']): string {
    return (
      {
        PENDING: 'Aguardando análise',
        CHANGES_REQUESTED: 'Ajustes solicitados',
        APPROVED: 'Aprovada',
        WAITING_PAYMENT: 'Aguardando pagamento',
        ACTIVE: 'Participação ativa',
        REJECTED: 'Não aprovada',
        WITHDRAWN: 'Retirada',
      }[status] ?? status
    );
  }

  paymentStatusLabel(status: string): string {
    return (
      {
        NOT_REQUIRED: 'Não necessário',
        NOT_AVAILABLE: 'Indisponível',
        WAITING_APPROVAL: 'Aguardando aprovação',
        WAITING_PAYMENT: 'Aguardando pagamento',
        UNDER_REVIEW: 'Em análise',
        PAID: 'Confirmado',
        REJECTED: 'Recusado',
      }[status] ?? status
    );
  }

  async submit(): Promise<void> {
    const data = this.data();
    if (!data || !this.canSubmit()) {
      if (!data?.tournament.selfSubscriptionAllowNoCategory && this.selectedCategories().size === 0) {
        this.snackbar.open('Escolha pelo menos uma modalidade.', 'Fechar', { duration: 4000 });
      }
      return;
    }
    this.busy.set(true);
    try {
      const value = this.form.getRawValue();
      await firstValueFrom(
        this.api.submitApplication({
          tournamentId: data.tournament.id,
          applicationId: this.application()?.id ?? null,
          requestedTeamId: value.requestedTeamId.trim() || null,
          categoryIds: [...this.selectedCategories()],
          noticeAccepted: value.noticeAccepted,
          imageLicenseAgreementAccepted: value.imageLicenseAgreementAccepted,
          paymentTier: value.paymentTier.trim() || null,
          pendingKey: this.uuid(),
        }),
      );
      this.submitted.set(true);
      if (this.returnUrl) {
        await this.router.navigateByUrl(this.returnUrl, { replaceUrl: true });
      }
    } catch (error: unknown) {
      this.snackbar.open(error instanceof Error ? error.message : 'Não foi possível enviar a inscrição.', 'Fechar', {
        duration: 6000,
      });
    } finally {
      this.busy.set(false);
    }
  }

  private uuid(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function isEditableApplication(application: CurrentUserSportsPlayerApplication | null): boolean {
  return Boolean(
    application &&
      EDITABLE_APPLICATION_STATUSES.includes(application.status as (typeof EDITABLE_APPLICATION_STATUSES)[number]),
  );
}

function isReadOnlyApplication(application: CurrentUserSportsPlayerApplication | null): boolean {
  return Boolean(application) && !isEditableApplication(application);
}
