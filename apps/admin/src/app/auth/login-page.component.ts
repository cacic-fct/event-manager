import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  computed,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, CacicLogoComponent } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    CacicLogoComponent,
  ],
  template: `
    <main class="login-page">
      <mat-card appearance="outlined">
        <lib-cacic-logo [fillColor]="fillColor()"></lib-cacic-logo>
        <h1>Event Manager</h1>
        @if (isDevelopment) {
          <p>Entre com e-mail e senha para acessar o painel.</p>

          <form [formGroup]="form" class="login-form" (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline">
              <mat-label>E-mail</mat-label>
              <input
                matInput
                type="email"
                autocomplete="username"
                formControlName="email"
              />
              @if (form.controls.email.hasError('email')) {
                <mat-error>Informe um e-mail válido.</mat-error>
              }
              @if (form.controls.email.hasError('required')) {
                <mat-error>Informe o e-mail.</mat-error>
              }
            </mat-form-field>

            <mat-form-field appearance="outline">
              <mat-label>Senha</mat-label>
              <input
                matInput
                [type]="hidePassword() ? 'password' : 'text'"
                autocomplete="current-password"
                formControlName="password"
              />
              <button
                mat-icon-button
                matSuffix
                type="button"
                [attr.aria-label]="
                  hidePassword() ? 'Mostrar senha' : 'Ocultar senha'
                "
                (click)="hidePassword.set(!hidePassword())"
              >
                <mat-icon>
                  {{ hidePassword() ? 'visibility' : 'visibility_off' }}
                </mat-icon>
              </button>
              @if (form.controls.password.hasError('required')) {
                <mat-error>Informe a senha.</mat-error>
              }
            </mat-form-field>

            @if (errorMessage()) {
              <p class="error-message" role="alert">{{ errorMessage() }}</p>
            }

            <button
              mat-flat-button
              color="primary"
              type="submit"
              [disabled]="form.invalid || isSubmitting()"
            >
              <mat-icon>login</mat-icon>
              {{ isSubmitting() ? 'Entrando...' : 'Entrar' }}
            </button>

            <button
              mat-button
              type="button"
              [disabled]="isSubmitting()"
              (click)="onSsoClick()"
            >
              <mat-icon>account_circle</mat-icon>
              Entrar com SSO
            </button>
          </form>
        } @else {
          <p>Painel interno de controle de eventos.</p>
          <p>É necessário permissão de acesso para utilizar esta aplicação.</p>
          <button mat-flat-button (click)="onSsoClick()">Entrar</button>
        }
      </mat-card>
    </main>
  `,
  styles: [
    `
      .login-page {
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background: var(--mat-sys-surface-container-low);
      }

      mat-card {
        width: min(100%, 32rem);
        padding: 2rem;
        border-radius: 8px;
      }

      h1 {
        margin: 1rem 0 0.25rem;
      }

      p {
        margin: 0 0 1.5rem;
        color: var(--mat-sys-on-surface-variant);
      }

      .login-form {
        display: grid;
        gap: 16px;
      }

      .login-form > button {
        min-height: 44px;
      }

      .error-message {
        margin: 0;
        padding: 12px;
        border-radius: 8px;
        color: var(--mat-sys-error);
        background: var(--mat-sys-error-container);
      }
    `,
  ],
})
export class LoginPageComponent {
  private readonly authService = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly isDevelopment = isDevMode();
  protected readonly hidePassword = signal(true);
  protected readonly isSubmitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly isDarkSignal = signal(false);
  protected readonly fillColor = computed(() =>
    this.isDarkSignal() ? '#fff' : '#000',
  );
  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  constructor() {
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl(this.returnTo() ?? '/');
    }

    if (isPlatformBrowser(this.platformId)) {
      const media = window.matchMedia('(prefers-color-scheme: dark)');

      this.isDarkSignal.set(media.matches);
      media.addEventListener('change', (event) => {
        this.isDarkSignal.set(event.matches);
      });
    }
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isDevelopment) {
      return;
    }

    if (this.form.invalid || this.isSubmitting()) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      const { email, password } = this.form.getRawValue();
      await this.authService.passwordLogin(email, password);
      await this.router.navigateByUrl(this.returnTo() ?? '/');
    } catch {
      this.errorMessage.set('E-mail ou senha inválidos.');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async onSsoClick(): Promise<void> {
    await this.authService.login({ returnTo: this.returnTo() ?? '/admin/' });
  }

  private returnTo(): string | undefined {
    return this.route.snapshot.queryParamMap.get('returnTo') ?? undefined;
  }
}
