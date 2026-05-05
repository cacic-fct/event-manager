import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  input,
  output,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { EventFiltersForm } from '../../../shared/event-list-filters';

@Component({
  selector: 'app-event-filter-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './event-filter-panel.component.html',
  styleUrl: './event-filter-panel.component.scss',
})
export class EventFilterPanelComponent {
  @ViewChild('queryInput')
  private queryInput?: ElementRef<HTMLInputElement>;

  readonly form = input.required<EventFiltersForm>();
  readonly applyLabel = input('Aplicar');
  readonly resetLabel = input('Limpar');

  readonly applyFilters = output<void>();
  readonly resetFilters = output<void>();

  focusQuickSearch(): void {
    this.queryInput?.nativeElement.focus();
  }
}
