import { Component, computed, effect, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { DEFAULT_MAP_CENTER } from '@cacic-fct/shared-utils';
import { EventLocationMap } from '../../events/detail/location-map';
import { playShowcaseSequence } from './showcase-animation';

interface SubscriptionActivity {
  id: string;
  name: string;
  emoji: string;
  type: 'Palestra' | 'Minicurso';
  time: string;
  location: string;
  slots: number;
  minutes: number;
  description: string;
}

const ACTIVITIES: readonly SubscriptionActivity[] = [
  {
    id: 'interfaces',
    name: 'Interfaces que incluem',
    emoji: '♿',
    type: 'Palestra',
    time: '14:00-15:30',
    location: 'Auditório',
    slots: 24,
    minutes: 90,
    description:
      'Uma conversa sobre acessibilidade e experiências digitais que acolhem mais pessoas. Conheça práticas para criar interfaces que funcionam para todo mundo.',
  },
  {
    id: 'ai',
    name: 'Realidade Virtual',
    emoji: '🥽',
    type: 'Minicurso',
    time: '16:00-18:00',
    location: 'Auditório',
    slots: 8,
    minutes: 120,
    description:
      'Um minicurso para explorar a realidade virtual e experimentar ambientes imersivos. Conheça ferramentas e crie seu primeiro protótipo.',
  },
  {
    id: 'prototype',
    name: 'Do protótipo ao mundo',
    emoji: '🚀',
    type: 'Palestra',
    time: '19:00-20:00',
    location: 'Auditório',
    slots: 36,
    minutes: 60,
    description:
      'Como transformar uma ideia em algo que as pessoas podem usar. Uma conversa sobre protótipos, decisões de produto e aprendizados.',
  },
];

@Component({
  selector: 'app-landing-major-event-subscription-demo',
  imports: [MatButtonModule, MatCheckboxModule, MatChipsModule, MatIconModule, TwemojiComponent, EventLocationMap],
  templateUrl: './major-event-subscription-demo.html',
  styleUrl: './major-event-subscription-demo.scss',
})
export class MajorEventSubscriptionDemoComponent {
  readonly activities = ACTIVITIES;
  readonly initialEventId = input<string | null>(null);
  readonly infoEventId = signal<string | null>(null);
  readonly infoEvent = computed(() => this.activities.find((activity) => activity.id === this.infoEventId()) ?? null);
  readonly mapLatitude = computed(() => DEFAULT_MAP_CENTER[1] + (this.infoEventId() === 'ai' ? 0.0011 : 0));
  readonly mapLongitude = computed(() => DEFAULT_MAP_CENTER[0] + (this.infoEventId() === 'ai' ? -0.0009 : 0));
  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly interacting = signal(false);
  readonly step = signal<'selection' | 'review' | 'confirmed'>('selection');
  readonly selectedActivities = computed(() =>
    this.activities.filter((activity) => this.selectedIds().has(activity.id)),
  );
  readonly courseCount = computed(
    () => this.selectedActivities().filter((activity) => activity.type === 'Minicurso').length,
  );
  readonly lectureCount = computed(
    () => this.selectedActivities().filter((activity) => activity.type === 'Palestra').length,
  );
  readonly totalMinutes = computed(() =>
    this.selectedActivities().reduce((sum, activity) => sum + activity.minutes, 0),
  );
  readonly durationLabel = computed(() => {
    const minutes = this.totalMinutes();
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}min` : `${hours}h`;
  });

  constructor() {
    effect(() => this.infoEventId.set(this.initialEventId()));
    playShowcaseSequence(
      (schedule) => {
        this.selectedIds.set(new Set());
        schedule(() => this.selectedIds.set(new Set(['interfaces'])), 385);
        schedule(() => this.selectedIds.set(new Set(['interfaces', 'ai'])), 770);
      },
      () => this.step() === 'selection' && !this.infoEventId() && !this.interacting(),
    );
  }

  toggleActivity(id: string): void {
    if (this.step() !== 'selection' || !this.activities.some((activity) => activity.id === id)) return;
    this.interacting.set(true);
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  openInfo(id: string): void {
    this.interacting.set(true);
    this.infoEventId.set(id);
  }

  review(): void {
    if (this.selectedActivities().length) this.step.set('review');
  }

  confirm(): void {
    if (this.step() === 'review' && this.selectedActivities().length) this.step.set('confirmed');
  }
}
