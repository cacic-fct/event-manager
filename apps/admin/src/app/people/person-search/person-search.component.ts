import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { debounceTime, distinctUntilChanged } from 'rxjs';

let nextPersonSearchId = 0;

@Component({
  selector: 'app-person-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './person-search.component.html',
  styleUrl: './person-search.component.scss',
})
export class PersonSearchComponent {
  readonly label = input('Buscar pessoa');
  readonly query = input('');
  readonly results = input<readonly Person[]>([]);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly disabledReason = input('Buscar pessoas exige permissão de Pessoa · Visualizar.');
  readonly minimumQueryLength = input(2);
  readonly resultActionIcon = input('person_add');
  readonly resultActionLabel = input('Selecionar');
  readonly showIdentitySummary = input(true);

  readonly queryChange = output<string>();
  readonly searchRequested = output<string>();
  readonly personSelected = output<Person>();

  protected readonly queryControl = new FormControl('', { nonNullable: true });
  protected readonly disabledHintId = `person-search-permission-hint-${nextPersonSearchId++}`;
  private readonly hasSearched = signal(false);

  constructor() {
    effect(() => {
      const query = this.query();
      if (query !== this.queryControl.value) {
        this.queryControl.setValue(query, { emitEvent: false });
      }
    });

    effect(() => {
      if (this.disabled()) {
        this.queryControl.disable({ emitEvent: false });
      } else {
        this.queryControl.enable({ emitEvent: false });
      }
    });

    this.queryControl.valueChanges
      .pipe(debounceTime(320), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((query) => this.emitSearch(query));
  }

  protected onQueryInput(query: string): void {
    this.hasSearched.set(false);
    this.queryChange.emit(query);
  }

  protected searchNow(): void {
    this.emitSearch(this.queryControl.value);
  }

  protected selectPerson(person: Person): void {
    this.personSelected.emit(person);
  }

  protected identitySummary(person: Person): string {
    return person.identityDocument || (person.academicId ? `Matrícula ${person.academicId}` : 'Sem documento informado');
  }

  protected showNoResults(): boolean {
    return this.hasSearched() && !this.disabled() && !this.loading() && this.results().length === 0
      && this.queryControl.value.trim().length >= this.minimumQueryLength();
  }

  private emitSearch(query: string): void {
    const normalized = query.trim();
    if (this.disabled()) {
      return;
    }
    const canSearch = normalized.length >= this.minimumQueryLength();
    this.hasSearched.set(canSearch);
    this.searchRequested.emit(canSearch ? normalized : '');
  }
}
