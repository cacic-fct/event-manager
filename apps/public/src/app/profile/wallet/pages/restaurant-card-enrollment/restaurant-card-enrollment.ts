import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '@cacic-fct/shared-angular';
import { RestaurantCardService } from '../../services/restaurant-card.service';

@Component({
  selector: 'app-restaurant-card-enrollment',
  imports: [
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatToolbarModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  template: `
    <mat-toolbar class="wallet-toolbar">
      <a matIconButton routerLink="/profile/wallet/add-card" aria-label="Voltar para os cartões disponíveis">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>Cartão do R.U.</span>
    </mat-toolbar>

    <main class="global-container restaurant-enrollment-page">
      <section class="restaurant-enrollment">
        <img src="/assets/unesp/unesp-symbol-white.svg" alt="" class="restaurant-symbol" />
        <h1>Cartão do R.U.</h1>
        <p>Obtenha o número do Cartão de Cliente a partir do SISRU</p>

        <form (ngSubmit)="save()">
          <mat-form-field appearance="outline">
            <mat-label>Número do Cartão de Cliente</mat-label>
            <input
              matInput
              [formControl]="cardNumber"
              inputmode="numeric"
              autocomplete="off"
              pattern="[0-9]*"
              (input)="keepOnlyNumbers($event)" />
            @if (cardNumber.invalid && cardNumber.touched) {
              <mat-error>Informe apenas números.</mat-error>
            }
          </mat-form-field>
          <button mat-flat-button type="submit" [disabled]="!canSave()">Adicionar cartão</button>
        </form>
      </section>
    </main>
  `,
  styles: `
    .restaurant-enrollment-page { max-width: 32rem; padding-block: 2rem; }
    .restaurant-enrollment { display: grid; gap: 1rem; padding: 1.5rem; color: #eaffff; background: hsl(187 100% 24%); border-radius: 16px; box-shadow: 0 14px 28px rgb(0 50 60 / 22%); }
    .restaurant-symbol { width: 3rem; height: 3rem; padding: 0.55rem; background: hsl(187 100% 18%); border-radius: 12px; }
    h1, p { margin: 0; }
    h1 { font-size: clamp(1.5rem, 6vw, 2rem); letter-spacing: -0.03em; }
    p { line-height: 1.5; }
    form { display: grid; gap: 0.25rem; margin-top: 0.75rem; }
    mat-form-field { width: 100%; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestaurantCardEnrollment {
  private readonly authService = inject(AuthService);
  private readonly restaurantCard = inject(RestaurantCardService);
  private readonly router = inject(Router);

  readonly cardNumber = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.pattern(/^\d+$/)],
  });
  keepOnlyNumbers(event: Event): void {
    if (!(event.target instanceof HTMLInputElement)) return;
    const value = event.target.value.replace(/\D/g, '');
    if (value !== event.target.value) event.target.value = value;
    this.cardNumber.setValue(value);
  }

  save(): void {
    const userId = this.authService.user()?.sub;
    if (!userId || this.cardNumber.invalid) return;
    this.restaurantCard.save(userId, this.cardNumber.value);
    void this.router.navigateByUrl('/profile/wallet');
  }

  canSave(): boolean {
    return this.cardNumber.valid && Boolean(this.authService.user()?.sub);
  }
}
