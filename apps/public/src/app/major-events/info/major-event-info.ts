import { isPlatformBrowser } from '@angular/common';
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
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MarkdownComponent, TwemojiComponent } from '@cacic-fct/shared-angular';
import type { PublicEvent, PublicMajorEvent } from '@cacic-fct/event-manager-public-contracts';
import { compareIsoDateAsc, formatDateRange, formatDateTime } from '@cacic-fct/shared-utils';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale/pt-BR';
import { CalendarEventListItem } from '../../calendar/event-list/event-list-item';
import { StickyDateHeader } from '../../shared/sticky-date-header';

export interface MajorEventInfoRegistration {
  title: string;
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

interface ProgramDay {
  id: string;
  label: string;
  weekday: string;
  shortDate: string;
  events: PublicEvent[];
}

@Component({
  selector: 'app-major-event-info',
  imports: [
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MarkdownComponent,
    TwemojiComponent,
    CalendarEventListItem,
    StickyDateHeader,
  ],
  templateUrl: './major-event-info.html',
  styleUrl: './major-event-info.css',
})
export class MajorEventInfo {
  readonly majorEvent = input.required<PublicMajorEvent>();
  readonly events = input<PublicEvent[]>([]);
  readonly registration = input.required<MajorEventInfoRegistration>();
  readonly links = input<MajorEventInfoLink[]>([]);
  readonly programLoading = input(false);
  readonly programError = input(false);
  readonly programHasMore = input(false);
  readonly now = input(Date.now());
  readonly loginRequested = output<void>();
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

  protected readonly programDays = computed(() => {
    const days = new Map<string, ProgramDay>();
    const events = [...this.events()].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
    for (const event of events) {
      const start = parseISO(event.startDate);
      const id = format(start, 'yyyy-MM-dd');
      let day = days.get(id);
      if (!day) {
        day = {
          id,
          label: format(start, "EEEE, d 'de' MMMM", { locale: ptBR }),
          weekday: format(start, 'EEE', { locale: ptBR }).replace('.', ''),
          shortDate: format(start, 'dd/MM'),
          events: [],
        };
        days.set(id, day);
      }
      day.events.push(event);
    }
    return [...days.values()];
  });

  private readonly daySelectionSource = computed(() => ({
    days: this.programDays(),
    majorEventId: this.majorEvent().id,
    today: format(new Date(this.now()), 'yyyy-MM-dd'),
  }));

  protected readonly selectedDay = linkedSignal({
    source: this.daySelectionSource,
    computation: (source, previous): string => {
      const sameContext =
        previous?.source.majorEventId === source.majorEventId && previous.source.today === source.today;
      if (sameContext && previous.source.days.length > 0) {
        if (previous.value === '' || source.days.some((day) => day.id === previous.value)) {
          return previous.value;
        }
      }
      return source.days.some((day) => day.id === source.today) ? source.today : '';
    },
  });

  protected readonly visibleDays = computed(() => {
    const selected = this.selectedDay();
    return selected ? this.programDays().filter((day) => day.id === selected) : this.programDays();
  });
}
