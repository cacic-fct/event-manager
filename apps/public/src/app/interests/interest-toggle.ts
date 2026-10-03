import { isPlatformBrowser } from '@angular/common';
import { Component, DestroyRef, PLATFORM_ID, computed, effect, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-fct/shared-angular';
import type { InterestTargetType } from '@cacic-fct/shared-event-participation';
import { finalize, timer } from 'rxjs';
import { NetworkStatusService } from '../shared/network-status.service';
import { InterestApiService } from './interest-api.service';

@Component({
  selector: 'app-interest-toggle',
  imports: [MatButtonModule, MatIconModule, MatSnackBarModule],
  host: { '[hidden]': '!visible()' },
  template: `
    @if (visible()) {
    <button mat-stroked-button type="button" [attr.aria-pressed]="interested()"
      [attr.aria-label]="'Quero ir: ' + targetName()" [attr.aria-busy]="loading() || saving()"
      [attr.aria-disabled]="saving()" [disabled]="blocked()" (click)="toggle()">
      <mat-icon aria-hidden="true">{{ interested() ? 'check' : 'favorite_border' }}</mat-icon>
      {{ loading() ? 'Carregando interesse...' : saving() ? 'Salvando...' : 'Quero ir' }}
    </button>
    @if (!isOnline()) {
      <p class="interest-hint">Conecte-se à internet para alterar seu interesse.</p>
    }
    @if (error()) {
      <p role="alert">{{ error() }}</p>
      @if (loadFailed()) {
        <button mat-button type="button" [disabled]="!isOnline()" (click)="retry()">Tentar novamente</button>
      }
    }
    }
  `,
  styles: `
    :host { display: block; }
    :host([hidden]) { display: none; }
    .interest-hint { margin: 0.5rem 0 0; font-size: 0.875rem; max-width: 42ch; }
  `,
})
export class InterestToggle {
  readonly targetType = input.required<InterestTargetType>();
  readonly targetId = input.required<string>();
  readonly targetName = input.required<string>();
  readonly subscribed = input(false);
  readonly interestEnabled = input(true);
  readonly endsAt = input<string | null>(null);
  readonly changed = output<boolean>();

  private readonly api = inject(InterestApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  readonly isOnline = inject(NetworkStatusService).isOnline;
  readonly interested = signal(false);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly loadFailed = signal(false);
  private readonly serverSubscribed = signal(false);
  private readonly serverEndsAt = signal<string | null>(null);
  private readonly enabled = signal(true);
  private readonly now = signal(Date.now());
  readonly isSubscribed = computed(() => this.subscribed() || this.serverSubscribed());
  readonly isFinished = computed(() => {
    const end = this.serverEndsAt() ?? this.endsAt();
    return Boolean(end && new Date(end).getTime() <= this.now());
  });
  readonly visible = computed(() => !this.isSubscribed() && !this.isFinished()
    && (this.interested() || (this.interestEnabled() && this.enabled()) || this.loading() || this.loadFailed()));
  readonly blocked = computed(() => this.loading() || this.loadFailed() || !this.isOnline()
    || this.isSubscribed() || this.isFinished() || (!this.interested() && (!this.enabled() || !this.interestEnabled())));
  private readonly reload = signal(0);

  constructor() {
    if (this.isBrowser) {
      timer(0, 30_000).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.now.set(Date.now()));
    }
    effect((onCleanup) => {
      const targetType = this.targetType();
      const targetId = this.targetId();
      const authenticated = this.auth.isAuthenticated();
      const online = this.isOnline();
      this.reload();
      this.subscribed();
      if (!this.isBrowser || !authenticated) {
        this.interested.set(false);
        this.serverSubscribed.set(false);
        this.serverEndsAt.set(null);
        return;
      }
      if (!online) return;
      this.loading.set(true);
      this.error.set(null);
      this.loadFailed.set(false);
      const subscription = this.api.getState(targetType, targetId).pipe(finalize(() => this.loading.set(false))).subscribe({
        next: (state) => {
          this.interested.set(Boolean(state.interest));
          this.serverSubscribed.set(state.subscribed);
          this.serverEndsAt.set(state.endsAt);
          this.enabled.set(state.enabled);
        },
        error: () => {
          this.loadFailed.set(true);
          this.error.set('Não foi possível carregar seu interesse. Tente novamente.');
        },
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }

  retry(): void { this.reload.update((value) => value + 1); }

  toggle(): void {
    if (!this.isBrowser || this.blocked() || this.saving()) return;
    if (!this.auth.isAuthenticated()) {
      void this.auth.login({ returnTo: this.router.url });
      return;
    }
    const targetId = this.targetId();
    const targetType = this.targetType();
    this.saving.set(true);
    this.error.set(null);
    this.api.set(targetType, targetId, !this.interested()).pipe(
      takeUntilDestroyed(this.destroyRef),
      finalize(() => this.saving.set(false)),
    ).subscribe({
      next: (interest) => {
        if (targetId !== this.targetId() || targetType !== this.targetType()) return;
        this.interested.set(Boolean(interest));
        this.changed.emit(Boolean(interest));
        this.snackBar.open(
          interest ? 'Seu interesse foi registrado! A inscrição, quando necessária, é feita separadamente.' : 'Interesse removido.',
          'Fechar',
          { duration: interest ? 12_000 : 5_000 },
        );
      },
      error: () => this.error.set('Não foi possível salvar seu interesse. Tente novamente.'),
    });
  }
}
