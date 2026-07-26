import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '@cacic-fct/shared-angular';
import { RestaurantCardService } from '../../services/restaurant-card.service';

@Component({
  selector: 'app-restaurant-card-enrollment',
  imports: [
    MatButtonModule,
    MatCardModule,
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
      <mat-card>
        <mat-card-header>
          <mat-card-title>Cartão do R.U.</mat-card-title>
          <mat-card-subtitle>Obtenha o número do Cartão de Cliente a partir do SISRU</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
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
        </mat-card-content>
      </mat-card>
    </main>
  `,
  styles: `
    .restaurant-enrollment-page {
      max-width: 32rem;
      padding-block: 2rem;
    }
    mat-card-content {
      padding-top: 1rem;
    }
    form {
      display: grid;
      gap: 0.25rem;
    }
    mat-form-field {
      width: 100%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RestaurantCardEnrollment {
  private readonly authService = inject(AuthService);
  private readonly restaurantCard = inject(RestaurantCardService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

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

  async save(): Promise<void> {
    const userId = this.authService.user()?.sub;
    if (!userId || this.cardNumber.invalid) return;
    try {
      await this.restaurantCard.save(userId, this.cardNumber.value);
      await this.router.navigateByUrl('/profile/wallet');
    } catch {
      this.snackBar.open('Não foi possível adicionar o cartão. Tente novamente.', 'Fechar', { duration: 5000 });
    }
  }

  canSave(): boolean {
    return this.cardNumber.valid && Boolean(this.authService.user()?.sub);
  }
}
