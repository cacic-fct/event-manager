import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-review-queue-pagination',
  imports: [MatButtonModule],
  template: `
    @if (page() || hasNextPage()) {
      <nav aria-label="Páginas da fila de revisão">
        <button mat-button type="button" [disabled]="!page() || disabled()" (click)="pageChange.emit(page() - 1)">
          Anterior
        </button>
        <span>Página {{ page() + 1 }}</span>
        <button
          mat-button
          type="button"
          [disabled]="!hasNextPage() || disabled()"
          (click)="pageChange.emit(page() + 1)">
          Próxima
        </button>
      </nav>
    }
  `,
  styles: `
    nav {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
    }
  `,
})
export class ReviewQueuePaginationComponent {
  readonly page = input.required<number>();
  readonly hasNextPage = input.required<boolean>();
  readonly disabled = input(false);
  readonly pageChange = output<number>();
}
