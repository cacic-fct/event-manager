import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatToolbarModule } from '@angular/material/toolbar';

@Component({
  selector: 'app-preferences',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatListModule, MatToolbarModule],
  template: `
    <mat-toolbar>
      <a matIconButton routerLink="/menu" aria-label="Voltar para o menu">
        <mat-icon>arrow_back</mat-icon>
      </a>
      <span>Preferências</span>
    </mat-toolbar>

    <main class="global-container">
      <mat-nav-list>
        <a mat-list-item routerLink="/preferences/calendar">
          <mat-icon matListItemIcon>calendar_month</mat-icon>
          <span matListItemTitle>Calendário</span>
        </a>
      </mat-nav-list>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Preferences {}
