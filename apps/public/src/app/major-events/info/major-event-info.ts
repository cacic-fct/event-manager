import { EventDetailTabs } from '../../shared/event-detail-tabs';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { EventInformationNav } from '../../shared/event-information-nav';
import { MarkdownComponent } from '@cacic-fct/shared-angular';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { formatDateRange, formatDateTime } from '@cacic-fct/shared-utils';
import { publicLocalDateKey } from '../../shared/public-local-date';
import { eventProgramDays } from '../../shared/event-program-days';
import { CalendarEventListItem } from '../../calendar/event-list/event-list-item';
import { EventDetailHeading } from '../../shared/event-detail-heading';
import { StickyDateHeader } from '../../shared/sticky-date-header';

export interface MajorEventInfoRegistration {
  title?: string;
  description?: string;
  action?: { label: string; route?: string[]; login?: boolean };
  secondaryAction?: { label: string; route: string[] };
}

export interface MajorEventInfoLink {
  label: string;
  icon: string;
  route?: string[];
  href?: string;
}

@Component({
  selector: 'app-major-event-info',
  imports: [
    RouterLink,
    NgTemplateOutlet,
    EventDetailTabs,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    EventInformationNav,
    MarkdownComponent,
    EventDetailHeading,
    CalendarEventListItem,
    StickyDateHeader,
  ],
  templateUrl: './major-event-info.html',
  styleUrl: './major-event-info.css',
})
export class MajorEventInfo {
  readonly majorEvent = input.required<PublicMajorEvent>();
  readonly events = input<PublicEvent[]>([]);
  readonly hasParticipation = input(false);
  readonly hasSubscription = input(false);
  readonly backUrl = input('/major-event');
  readonly registration = input.required<MajorEventInfoRegistration>();
  readonly links = input<MajorEventInfoLink[]>([]);
  readonly programLoading = input(false);
  readonly participationLoading = input(false);
  readonly participationPending = input(false);
  readonly subscriptionError = input(false);
  readonly subscriptionRetrying = input(false);
  readonly programError = input(false);
  readonly programHasMore = input(false);
  readonly programPages = input(0);
  readonly initialProgramDay = input<string | null>(null);
  readonly now = input(Date.now());
  readonly loginRequested = output<void>();
  readonly retrySubscription = output<void>();
  readonly retryProgram = output<void>();
  readonly loadMoreProgram = output<void>();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly dayNavigation = viewChild<ElementRef<HTMLElement>>('dayNavigation');
  protected readonly dayNavigationHeight = signal(0);

  constructor() {
    afterRenderEffect((onCleanup) => {
      if (!isPlatformBrowser(this.platformId)) {
        return;
      }
      const navigation = this.dayNavigation()?.nativeElement;
      if (!navigation) {
        this.dayNavigationHeight.set(0);
        return;
      }
      const measure = () => this.dayNavigationHeight.set(navigation.getBoundingClientRect().height);
      measure();
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(measure);
      observer.observe(navigation);
      onCleanup(() => observer.disconnect());
    });
  }

  protected readonly dateLabel = computed(() => {
    const event = this.majorEvent();
    return formatDateRange(event.startDate, event.endDate);
  });

  protected readonly paymentLabel = computed(() => {
    const required = this.majorEvent().isPaymentRequired;
    return required === true ? 'Requer pagamento' : required === false ? 'Gratuito' : null;
  });

  protected readonly subscriptionPeriod = computed(() => {
    const event = this.majorEvent();
    if (
      Date.parse(event.endDate) <= this.now() ||
      (event.subscriptionEndDate && Date.parse(event.subscriptionEndDate) <= this.now())
    ) {
      return null;
    }
    if (event.subscriptionStartDate && event.subscriptionEndDate) {
      return formatDateRange(event.subscriptionStartDate, event.subscriptionEndDate);
    }
    if (event.subscriptionStartDate) {
      return `A partir de ${formatDateTime(event.subscriptionStartDate)}`;
    }
    if (event.subscriptionEndDate) {
      return `Até ${formatDateTime(event.subscriptionEndDate)}`;
    }
    return null;
  });

  protected readonly contactText = computed(() => {
    const hasContactLink = this.links().some((link) => /^(mailto:|tel:|https:\/\/wa\.me\/)/.test(link.href ?? ''));
    return hasContactLink ? null : this.majorEvent().contactInfo?.trim() || null;
  });

  protected readonly programDays = computed(() => eventProgramDays(this.events()));

  protected readonly manualProgramDay = linkedSignal({
    source: () => ({ majorEventId: this.majorEvent().id, initialDay: this.initialProgramDay() }),
    computation: (source, previous): string | null =>
      previous?.source.majorEventId === source.majorEventId && previous.source.initialDay === source.initialDay
        ? previous.value
        : null,
  });

  protected readonly selectedDay = computed(() => {
    const days = this.programDays();
    const preferred = this.manualProgramDay() ?? this.initialProgramDay();
    if (preferred !== null && (preferred === '' || days.some((day) => day.id === preferred))) {
      return preferred;
    }
    const today = publicLocalDateKey(new Date(this.now()));
    return days.some((day) => day.id === today) ? today : '';
  });

  protected readonly programReturnUrl = computed(() => {
    const params = new URLSearchParams({
      programDay: this.selectedDay(),
      programPages: String(this.programPages()),
    });
    return `/major-event/${this.majorEvent().id}?${params}`;
  });

  protected readonly visibleDays = computed(() => {
    const selected = this.selectedDay();
    return selected ? this.programDays().filter((day) => day.id === selected) : this.programDays();
  });
}
