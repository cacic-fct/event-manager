import { Component, ElementRef, ViewChild, computed, input, output } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { provideDateFnsAdapter } from '@angular/material-date-fns-adapter';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { ptBR } from 'date-fns/locale';
import { startWith, switchMap } from 'rxjs';
import { EventFiltersForm } from './event-list-filters';

@Component({
  selector: 'app-event-filter-panel',
  providers: [provideDateFnsAdapter(), { provide: MAT_DATE_LOCALE, useValue: ptBR }],
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatExpansionModule,
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
  readonly queryLabel = input('Buscar eventos');
  readonly queryPlaceholder = input('');
  readonly filterHint = input('');

  readonly applyFilters = output<void>();
  readonly resetFilters = output<void>();

  private readonly filterValue = toSignal(
    toObservable(this.form).pipe(switchMap((form) => form.valueChanges.pipe(startWith(form.getRawValue())))),
  );
  protected readonly activeFilterCount = computed(() => {
    const value = this.filterValue();
    return [
      !!value?.startDateFrom,
      !!value?.startDateUntil,
      !!value?.isInGroup && value.isInGroup !== 'ALL',
      !!value?.isInMajorEvent && value.isInMajorEvent !== 'ALL',
    ].filter(Boolean).length;
  });

  focusQuickSearch(): void {
    this.queryInput?.nativeElement.focus();
  }
}
