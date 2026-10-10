import { Component, ElementRef, afterRenderEffect, computed, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import {
  OralAttendanceComponent,
  type OralAttendanceDecision,
  type OralAttendancePerson,
  TwemojiComponent,
} from '@cacic-fct/shared-angular';

const INITIAL_PEOPLE: readonly OralAttendancePerson[] = [
  {
    personId: 'attendance-marina-costa',
    fullName: 'Marina Costa',
    identityDocument: '•••.•••.•••-••',
    unespRole: 'Graduação',
  },
  {
    personId: 'attendance-rafael-almeida',
    fullName: 'Rafael Almeida',
    identityDocument: '•••.•••.•••-••',
    unespRole: 'Graduação',
  },
  {
    personId: 'attendance-beatriz-lima',
    fullName: 'Beatriz Lima',
    identityDocument: '•••.•••.•••-••',
    unespRole: 'Graduação',
  },
];

@Component({
  selector: 'app-landing-attendance-demo',
  imports: [MatButtonModule, MatIconModule, OralAttendanceComponent, TwemojiComponent],
  templateUrl: './attendance-demo.html',
  styleUrl: './attendance-demo.scss',
})
export class AttendanceDemoComponent {
  readonly exit = output<void>();
  readonly people = signal<readonly OralAttendancePerson[]>(INITIAL_PEOPLE);
  readonly decisions = signal<ReadonlyMap<string, OralAttendanceDecision>>(new Map());
  readonly componentGeneration = signal(0);
  readonly finished = signal(false);
  readonly isComplete = computed(() => this.people().length > 0 && this.decisions().size === this.people().length);

  private readonly completionHeading = viewChild<ElementRef<HTMLHeadingElement>>('completionHeading');

  constructor() {
    afterRenderEffect({
      write: () => {
        if (this.finished()) this.completionHeading()?.nativeElement.focus();
      },
    });
  }

  registerDecision(change: { person: OralAttendancePerson; decision: OralAttendanceDecision }): void {
    this.decisions.update((current) => {
      const next = new Map(current);
      next.set(change.person.personId, change.decision);
      return next;
    });
  }

  registerManual(identifier: string): void {
    if (!identifier.trim()) {
      return;
    }

    this.finished.set(true);
  }

  restartCall(): void {
    this.people.set(INITIAL_PEOPLE);
    this.decisions.set(new Map());
    this.finished.set(false);
    this.componentGeneration.update((generation) => generation + 1);
  }
}
