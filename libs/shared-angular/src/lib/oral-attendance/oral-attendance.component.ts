import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { CdkDrag, CdkDragEnd, CdkDragMove } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';

export type OralAttendanceDecision = 'PRESENT' | 'ABSENT';
export type OralAttendanceViewMode = 'CARDS' | 'LIST';

export interface OralAttendancePerson {
  personId: string;
  fullName: string;
  identityDocument?: string | null;
  unespRole?: string | null;
}

@Component({
  selector: 'lib-oral-attendance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CdkDrag,
    ReactiveFormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatToolbarModule,
  ],
  templateUrl: './oral-attendance.component.html',
  styleUrl: './oral-attendance.component.scss',
})
export class OralAttendanceComponent {
  private readonly snackbar = inject(MatSnackBar);
  readonly people = input.required<readonly OralAttendancePerson[]>();
  readonly decisions = input.required<ReadonlyMap<string, OralAttendanceDecision>>();
  readonly title = input('Chamada oral');
  readonly syncLabel = input<string | null>(null);
  readonly backRequested = output<void>();
  readonly decisionChanged = output<{ person: OralAttendancePerson; decision: OralAttendanceDecision }>();
  readonly manualSubmitted = output<string>();

  protected readonly viewMode = signal<OralAttendanceViewMode>('CARDS');
  protected readonly swipingEnabled = signal(true);
  protected readonly dragDirection = signal<'LEFT' | 'RIGHT' | null>(null);
  protected readonly reminderConfirmed = signal(false);
  protected readonly reminderVisible = signal(false);
  protected readonly manualStep = signal(false);
  protected readonly undoPersonIds = signal<readonly string[]>([]);
  protected readonly redoPersonIds = signal<readonly string[]>([]);
  protected readonly reviewPersonId = signal<string | null>(null);
  protected readonly manualValue = new FormControl('', { nonNullable: true, validators: Validators.required });

  protected readonly undecidedPeople = computed(() =>
    this.people().filter((person) => !this.decisions().has(person.personId)),
  );
  protected readonly visiblePeople = computed(() =>
    this.reminderConfirmed() ? this.undecidedPeople() : this.people(),
  );
  protected readonly currentPerson = computed(() => {
    const reviewPersonId = this.reviewPersonId();
    return (
      (reviewPersonId ? this.people().find((person) => person.personId === reviewPersonId) : undefined) ??
      this.undecidedPeople()[0] ??
      null
    );
  });
  protected readonly decidedCount = computed(() => this.people().length - this.undecidedPeople().length);
  protected readonly progress = computed(() =>
    this.people().length ? Math.round((this.decidedCount() / this.people().length) * 100) : 100,
  );
  protected readonly shouldShowReminder = computed(
    () =>
      !this.reminderConfirmed() &&
      (this.reminderVisible() || (this.viewMode() === 'CARDS' && this.undecidedPeople().length === 0)),
  );
  protected readonly shouldShowManual = computed(() => this.reminderConfirmed() && this.undecidedPeople().length === 0);

  protected setViewMode(mode: OralAttendanceViewMode): void {
    this.viewMode.set(mode);
  }

  protected toggleSwiping(): void {
    this.swipingEnabled.update((enabled) => !enabled);
    this.snackbar.open(
      this.swipingEnabled() ? 'Gestos de deslizar ativados.' : 'Gestos de deslizar desativados.',
      'Fechar',
      { duration: 2800 },
    );
  }

  protected decide(person: OralAttendancePerson, decision: OralAttendanceDecision): void {
    this.undoPersonIds.update((personIds) => [
      ...personIds.filter((personId) => personId !== person.personId),
      person.personId,
    ]);
    this.redoPersonIds.set([]);
    this.reviewPersonId.set(null);
    this.decisionChanged.emit({ person, decision });
  }

  protected undo(): void {
    const personId = this.undoPersonIds().at(-1);
    if (!personId) {
      return;
    }
    this.undoPersonIds.update((personIds) => personIds.slice(0, -1));
    this.redoPersonIds.update((personIds) => [...personIds, personId]);
    this.reviewPersonId.set(personId);
  }

  protected redo(): void {
    const personId = this.redoPersonIds().at(-1);
    if (!personId) {
      return;
    }
    this.redoPersonIds.update((personIds) => personIds.slice(0, -1));
    this.undoPersonIds.update((personIds) => [...personIds, personId]);
    this.reviewPersonId.set(personId);
  }

  protected onDragMoved(event: CdkDragMove): void {
    if (!this.swipingEnabled()) {
      return;
    }
    this.dragDirection.set(event.distance.x < -24 ? 'LEFT' : event.distance.x > 24 ? 'RIGHT' : null);
  }

  protected onDragEnded(event: CdkDragEnd, person: OralAttendancePerson): void {
    const distance = event.distance.x;
    event.source.reset();
    this.dragDirection.set(null);
    if (!this.swipingEnabled() || Math.abs(distance) < 80) {
      return;
    }
    this.decide(person, distance > 0 ? 'PRESENT' : 'ABSENT');
  }

  protected continueAfterReminder(): void {
    this.reminderConfirmed.set(true);
    this.reminderVisible.set(false);
  }

  protected finishFirstPass(): void {
    this.reminderVisible.set(true);
  }

  protected continueToManual(): void {
    this.manualStep.set(true);
  }

  protected submitManual(): void {
    if (this.manualValue.invalid) {
      this.manualValue.markAsTouched();
      return;
    }
    this.manualSubmitted.emit(this.manualValue.value.trim());
    this.manualValue.reset('');
  }
}
