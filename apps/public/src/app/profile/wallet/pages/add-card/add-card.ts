import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'app-wallet-add-card',
  imports: [MatIconModule, MatListModule, MatToolbarModule, RouterLink],
  template: `
    <mat-toolbar class="wallet-toolbar">
      <a matIconButton routerLink="/profile/wallet" aria-label="Voltar para a carteira">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>Adicionar cartão</span>
    </mat-toolbar>

    <main class="global-container wallet-add-page">
      <mat-nav-list aria-label="Cartões disponíveis">
        <a mat-list-item routerLink="restaurant">
          <img matListItemIcon src="/assets/unesp/unesp-symbol-cyan.svg" alt="" class="restaurant-list-icon" />
          <span matListItemTitle>Cartão do R.U.</span>
          <span matListItemLine>Use o Cartão de Cliente do Restaurante Universitário.</span>
          <mat-icon matListItemMeta>chevron_right</mat-icon>
        </a>
      </mat-nav-list>
    </main>
  `,
  styles: `
    .wallet-add-page {
      max-width: 40rem;
      padding-block: 1.5rem;
    }
    .restaurant-list-icon {
      box-sizing: border-box;
      width: 2.5rem;
      height: 2.5rem;
      padding: 0.45rem;
      background: hsl(187 100% 28%);
      border-radius: 50%;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletAddCard {}
