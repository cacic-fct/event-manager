import { Component, input } from '@angular/core';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-page-progress',
  imports: [MatProgressBarModule],
  template: `
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" [attr.aria-label]="label()" />
    }
  `,
  styles: `
    :host {
      display: block;
      min-height: 4px;
    }
  `,
})
export class PageProgress {
  readonly loading = input.required<boolean>();
  readonly label = input('Carregando informações');
}
