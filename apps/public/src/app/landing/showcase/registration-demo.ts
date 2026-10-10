import { Component, computed, input, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';
import { TwemojiComponent } from '@cacic-fct/shared-angular';
import { getSubscriptionStatusLabel } from '@cacic-fct/shared-utils';
import { MajorEventSubscriptionDemoComponent } from './major-event-subscription-demo';

type OrganizerDemoEventId = 'interfaces' | 'creating-with-ai';
type OrganizerDemoSubscriptionStatus =
  | 'CONFIRMED'
  | 'CANCELED'
  | 'REJECTED_NO_SLOTS'
  | 'REJECTED_SCHEDULE_CONFLICT';

interface OrganizerDemoEvent {
  id: OrganizerDemoEventId;
  name: string;
  emoji: string;
  startTime: string;
  locationDescription: string;
  slots: number | null;
}

interface OrganizerDemoSubscription {
  id: string;
  eventId: OrganizerDemoEventId;
  personName: string;
  subscriptionStatus: OrganizerDemoSubscriptionStatus;
}

const INITIAL_EVENTS: OrganizerDemoEvent[] = [
  {
    id: 'interfaces',
    name: 'Interfaces que incluem',
    emoji: '♿',
    startTime: '14:00',
    locationDescription: 'Auditório',
    slots: 4,
  },
  {
    id: 'creating-with-ai',
    name: 'Realidade Virtual',
    emoji: '🥽',
    startTime: '16:00',
    locationDescription: 'Auditório',
    slots: 1,
  },
];

const DEMO_SUBSCRIPTIONS: readonly OrganizerDemoSubscription[] = [
  {
    id: 'interfaces-marina',
    eventId: 'interfaces',
    personName: 'Marina Costa',
    subscriptionStatus: 'CONFIRMED',
  },
  {
    id: 'interfaces-rafael',
    eventId: 'interfaces',
    personName: 'Rafael Almeida',
    subscriptionStatus: 'CONFIRMED',
  },
  {
    id: 'interfaces-beatriz',
    eventId: 'interfaces',
    personName: 'Beatriz Lima',
    subscriptionStatus: 'REJECTED_SCHEDULE_CONFLICT',
  },
  {
    id: 'ai-joana',
    eventId: 'creating-with-ai',
    personName: 'Joana Martins',
    subscriptionStatus: 'CONFIRMED',
  },
  {
    id: 'ai-pedro',
    eventId: 'creating-with-ai',
    personName: 'Pedro Oliveira',
    subscriptionStatus: 'REJECTED_NO_SLOTS',
  },
  {
    id: 'ai-ana',
    eventId: 'creating-with-ai',
    personName: 'Ana Clara Silva',
    subscriptionStatus: 'CANCELED',
  },
];

@Component({
  selector: 'app-landing-registration-demo',
  imports: [
    FormField,
    MajorEventSubscriptionDemoComponent,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    TwemojiComponent,
  ],
  templateUrl: './registration-demo.html',
  styleUrl: './registration-demo.scss',
})
export class RegistrationDemoComponent {
  readonly organizer = input(false);
  readonly events = signal(INITIAL_EVENTS);
  readonly selectedEventId = signal<OrganizerDemoEventId>('interfaces');
  readonly selectedTabIndex = signal(0);
  readonly eventSaved = signal(false);
  readonly subscriptionSearchModel = signal({ query: '' });
  readonly subscriptionSearchForm = form(this.subscriptionSearchModel);
  readonly eventDetailsModel = signal({
    name: INITIAL_EVENTS[0].name,
    locationDescription: INITIAL_EVENTS[0].locationDescription,
  });
  readonly eventDetailsForm = form(this.eventDetailsModel, (schema) => {
    required(schema.name);
    maxLength(schema.name, 100);
    maxLength(schema.locationDescription, 120);
  });

  readonly selectedEvent = computed(
    () => this.events().find((event) => event.id === this.selectedEventId()) ?? null,
  );
  readonly filteredSubscriptions = computed(() => {
    const eventId = this.selectedEventId();
    const query = this.subscriptionSearchModel().query.trim().toLocaleLowerCase('pt-BR');

    return DEMO_SUBSCRIPTIONS.filter(
      (subscription) =>
        subscription.eventId === eventId &&
        subscription.personName.toLocaleLowerCase('pt-BR').includes(query),
    );
  });
  readonly hasUnsavedEventChanges = computed(() => {
    const event = this.selectedEvent();
    const formValue = this.eventDetailsModel();

    return !!event &&
      (formValue.name !== event.name || formValue.locationDescription !== event.locationDescription);
  });

  selectEvent(eventId: OrganizerDemoEventId): void {
    const event = this.events().find((candidate) => candidate.id === eventId);
    if (!event) {
      return;
    }

    this.selectedEventId.set(eventId);
    this.eventDetailsModel.set({
      name: event.name,
      locationDescription: event.locationDescription,
    });
    this.eventSaved.set(false);
    this.subscriptionSearchModel.set({ query: '' });
  }

  saveEventDetails(): void {
    const event = this.selectedEvent();
    if (!event || this.eventDetailsForm().invalid()) {
      return;
    }

    const updated = {
      name: this.eventDetailsModel().name.trim(),
      locationDescription: this.eventDetailsModel().locationDescription.trim(),
    };

    this.events.update((events) =>
      events.map((candidate) =>
        candidate.id === event.id
          ? { ...candidate, ...updated }
          : candidate,
      ),
    );
    this.eventDetailsModel.set(updated);
    this.eventSaved.set(true);
  }

  eventCapacitySummary(event: OrganizerDemoEvent): string {
    if (event.slots === null) {
      return 'Vagas ilimitadas';
    }

    const confirmedCount = this.confirmedSubscriptionsCount(event.id);
    const availableSlots = Math.max(0, event.slots - confirmedCount);
    if (availableSlots === 0) {
      return 'Nenhuma vaga restante';
    }

    const slotLabel = event.slots === 1 ? 'vaga restante' : 'vagas restantes';

    return `${availableSlots} de ${event.slots} ${slotLabel}`;
  }

  private confirmedSubscriptionsCount(eventId: OrganizerDemoEventId): number {
    return DEMO_SUBSCRIPTIONS.filter(
      (subscription) =>
        subscription.eventId === eventId && subscription.subscriptionStatus === 'CONFIRMED',
    ).length;
  }

  subscriptionStatusLabel(status: OrganizerDemoSubscriptionStatus): string {
    return getSubscriptionStatusLabel(status);
  }
}
