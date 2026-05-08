import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { catchError, map, of, startWith } from 'rxjs';
import { EmojiService } from '../profile/attendances/emoji.service';
import { OnlineAttendanceApiService } from './online-attendance-api.service';

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
  templateUrl: './online-attendance-list.component.html',
  styleUrl: './online-attendance-list.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnlineAttendanceListComponent {
  private readonly api = inject(OnlineAttendanceApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly emoji = inject(EmojiService);
  readonly returnUrl = toSignal(
    this.route.queryParamMap.pipe(
      map((params) => params.get('returnUrl') || '/menu'),
    ),
    { initialValue: '/menu' },
  );
  readonly state = toSignal(
    this.api.listPendingEvents().pipe(
      map((items) => ({ status: 'ready', items }) as const),
      startWith({ status: 'loading' } as const),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar presenças pendentes.',
        } as const),
      ),
    ),
    { initialValue: { status: 'loading' } as const },
  );

  back(): void {
    void this.router.navigateByUrl(this.returnUrl() || '/menu');
  }
}
