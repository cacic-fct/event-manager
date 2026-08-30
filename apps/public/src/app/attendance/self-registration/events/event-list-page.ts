import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { EMPTY, catchError, map, switchMap, take } from 'rxjs';
import { EmojiService } from '../../../shared/emoji.service';
import { OnlineAttendanceApiService, PendingOnlineAttendanceEvent } from '../online-attendance-api.service';
import { OnlineAttendanceCoordinatorService } from '../coordinator.service';

type OnlineAttendanceListState =
  | { status: 'loading' }
  | { status: 'ready'; items: PendingOnlineAttendanceEvent[] }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-online-attendance-list',
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    MatToolbarModule,
    RouterLink,
  ],
  templateUrl: './event-list-page.html',
  styleUrl: './event-list-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineAttendanceListComponent {
  private readonly api = inject(OnlineAttendanceApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly attendanceCoordinator = inject(OnlineAttendanceCoordinatorService);
  private requestId = 0;

  readonly emoji = inject(EmojiService);
  readonly returnUrl = toSignal(this.route.queryParamMap.pipe(map((params) => params.get('returnUrl') || '/menu')), {
    initialValue: '/menu',
  });
  readonly state = signal<OnlineAttendanceListState>({ status: 'loading' });

  constructor() {
    this.loadPendingEvents(true);
    this.attendanceCoordinator
      .changes()
      .pipe(
        switchMap(() => {
          const requestId = ++this.requestId;
          return this.api.listPendingEvents().pipe(
            take(1),
            map((items) => ({ items, requestId })),
            catchError(() => EMPTY),
          );
        }),
        catchError(() => EMPTY),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ items, requestId }) => {
        if (requestId === this.requestId) {
          this.state.set({ status: 'ready', items });
        }
      });
  }

  back(): void {
    const state = this.state();
    this.attendanceCoordinator.dismissPending(
      state.status === 'ready' ? state.items.map(({ eventId }) => eventId) : [],
      this.returnUrl() || '/menu',
    );
  }

  private loadPendingEvents(initial: boolean): void {
    const requestId = ++this.requestId;
    this.api
      .listPendingEvents()
      .pipe(take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (items) => {
          if (requestId === this.requestId) {
            this.state.set({ status: 'ready', items });
          }
        },
        error: (error: unknown) => {
          if (requestId !== this.requestId) return;
          if (initial || this.state().status !== 'ready') {
            this.state.set({
              status: 'error',
              message: error instanceof Error ? error.message : 'Não foi possível carregar presenças pendentes.',
            });
          }
        },
      });
  }
}
