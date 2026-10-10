import { Component, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

export interface ShowcaseFeature {
  icon: string;
  label: string;
  title: string;
  description: string;
  details: readonly string[];
}

@Component({
  selector: 'app-landing-showcase-stage',
  imports: [MatButtonModule, MatIconModule, RouterLink],
  template: `
    <div class="stage">
      <div class="stage-copy">
        <h3>{{ feature().title }}</h3>
        <p>{{ feature().description }}</p>
        <ul role="list">
          @for (detail of feature().details; track detail) {
            <li><mat-icon aria-hidden="true">check</mat-icon><span>{{ detail }}</span></li>
          }
        </ul>
        @if (organizer()) {
          <a matButton href="/admin">Acessar o painel de organização<mat-icon iconPositionEnd>arrow_forward</mat-icon></a>
        } @else {
          <a matButton routerLink="/calendar">Explorar a programação<mat-icon iconPositionEnd>arrow_forward</mat-icon></a>
        }
      </div>
      <div>
        <div class="product-window">
          <div class="window-bar">
            <strong><mat-icon aria-hidden="true">{{ feature().icon }}</mat-icon>{{ feature().label }}</strong>
          </div>
          <ng-content />
        </div>
      </div>
    </div>
  `,
  styleUrl: './showcase-stage.scss',
})
export class ShowcaseStageComponent {
  readonly feature = input.required<ShowcaseFeature>();
  readonly organizer = input(false);
}
