import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { SportsOperationsApiService } from './sports-operations-api.service';
import { CurrentUserTournamentOperations } from './sports-operations.types';

@Component({
  selector: 'app-sports-self-subscription-page',
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatSelectModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    RouterLink,
    CurrencyPipe,
    TwemojiComponent,
  ],
  templateUrl: './self-subscription-page.html',
  styleUrl: './self-subscription-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SportsSelfSubscriptionPage implements OnInit {
  private readonly api = inject(SportsOperationsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly snackbar = inject(MatSnackBar);

  readonly data = signal<CurrentUserTournamentOperations | null>(null);
  readonly selectedCategories = signal<Set<string>>(new Set());
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);
  readonly canSubmit = computed(() => {
    const tournament = this.data()?.tournament;
    return Boolean(
      tournament &&
      !this.busy() &&
      this.form.valid &&
      (tournament.selfSubscriptionAllowNoCategory || this.selectedCategories().size > 0),
    );
  });

  readonly form = new FormGroup({
    requestedTeamId: new FormControl('', { nonNullable: true }),
    noticeAccepted: new FormControl(false, { nonNullable: true, validators: Validators.requiredTrue }),
    paymentTier: new FormControl('', { nonNullable: true }),
  });

  protected tournamentId = '';

  ngOnInit(): void {
    this.tournamentId = this.route.snapshot.paramMap.get('tournamentId') ?? '';
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.tournament(this.tournamentId).subscribe({
      next: (data) => {
        this.data.set(data);
        const requestedTeam = this.form.controls.requestedTeamId;
        if (data.tournament.selfSubscriptionAllowNoTeam) {
          requestedTeam.clearValidators();
        } else {
          requestedTeam.addValidators(Validators.required);
        }
        requestedTeam.updateValueAndValidity();
        const paymentTier = this.form.controls.paymentTier;
        if (data.tournament.isPaymentRequired && data.tournament.paymentTiers.length > 0) {
          paymentTier.addValidators(Validators.required);
          if (data.tournament.paymentTiers.length === 1) {
            paymentTier.setValue(data.tournament.paymentTiers[0].name);
          }
        } else {
          paymentTier.clearValidators();
          paymentTier.setValue('');
        }
        paymentTier.updateValueAndValidity();
        this.loading.set(false);
        this.error.set(null);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.error.set(error instanceof Error ? error.message : 'Não foi possível abrir a inscrição.');
      },
    });
  }

  toggleCategory(categoryId: string, selected: boolean): void {
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
      await firstValueFrom(this.api.submitApplication({
        tournamentId: data.tournament.id,
        requestedTeamId: value.requestedTeamId.trim() || null,
        categoryIds: [...this.selectedCategories()],
        noticeAccepted: value.noticeAccepted,
        paymentTier: value.paymentTier.trim() || null,
        pendingKey: this.uuid(),
      }));
      this.submitted.set(true);
    } catch (error: unknown) {
      this.snackbar.open(
        error instanceof Error ? error.message : 'Não foi possível enviar a inscrição.',
        'Fechar',
        { duration: 6000 },
      );
    } finally {
      this.busy.set(false);
    }
  }

  private uuid(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}
