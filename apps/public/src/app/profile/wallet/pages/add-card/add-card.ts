import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-wallet-add-card',
  imports: [MatIconModule, MatListModule, MatToolbarModule, MatButtonModule, RouterLink],
  template: `
    <mat-toolbar class="wallet-toolbar">
      <a matIconButton routerLink="/profile/wallet" aria-label="Voltar para a carteira">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <h1 class="global-toolbar-title">Adicionar cartão</h1>
    </mat-toolbar>

    <main class="global-container wallet-add-page">
      <mat-nav-list aria-label="Cartões disponíveis"></mat-nav-list>
    </main>
  `,
  styles: `
    .wallet-add-page {
      max-width: 40rem;
      padding-block: 1.5rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WalletAddCard {}
