import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  PLATFORM_ID,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService, CacicLogoComponent } from '@cacic-eventos/shared-angular';
import type { PublicEvent } from '@cacic-eventos/shared-utils';
import { startOfDay } from 'date-fns';
import { Observable, catchError, map, of, startWith } from 'rxjs';
import { CalendarApiService } from '../tabs/calendar/calendar-api.service';
import { CalendarEventListItem } from '../tabs/calendar/calendar-event-list-item';

type CalendarPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; events: PublicEvent[] }
  | { status: 'error'; message: string };

const CALENDAR_PREVIEW_LIMIT = 5;

@Component({
  selector: 'app-login-page',
  imports: [
    CacicLogoComponent,
    CalendarEventListItem,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    RouterLink,
  ],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly calendarApi = inject(CalendarApiService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly calendarState = toSignal(this.createCalendarState(), {
    initialValue: { status: 'loading' } satisfies CalendarPreviewState,
  });

  private createCalendarState(): Observable<CalendarPreviewState> {
    if (!this.isBrowser) {
      return of({ status: 'loading' } satisfies CalendarPreviewState);
    }

    return this.calendarApi
      .getCalendarEvents({
        query: '',
        eventType: 'ALL',
        startDateFrom: startOfDay(new Date()).toISOString(),
      })
      .pipe(
        map(
          (events) =>
            ({
              status: 'ready',
              events: events.slice(0, CALENDAR_PREVIEW_LIMIT),
            }) satisfies CalendarPreviewState,
        ),
        startWith({ status: 'loading' } satisfies CalendarPreviewState),
        catchError((error: unknown) =>
          of({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : 'Não foi possível carregar o calendário.',
          } satisfies CalendarPreviewState),
        ),
      );
  }

  ngOnInit(): void {
    if (this.authService.isAuthenticated()) {
      void this.router.navigateByUrl('/menu');
    }
  }

  async login(): Promise<void> {
    if (this.authService.isAuthenticated()) {
      await this.router.navigateByUrl('/menu');
      return;
    }
    await this.authService.login();
  }
}
