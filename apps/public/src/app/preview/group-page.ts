import { DatePipe } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { RouteErrorService } from '@cacic-fct/shared-angular/errors';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { compareIsoDateAsc, formatDateRange, getEventTypeLabel } from '@cacic-fct/shared-utils';
import { EmojiService } from '../shared/emoji.service';
import {
  MajorEventSubscriptionApiService,
  PublicationGroupPreview,
} from '../major-events/registration/subscription-api.service';
import { privateResourceErrorStatus } from '../shared/route-error-handling';

type GroupPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; preview: PublicationGroupPreview };

@Component({
  selector: 'app-group-preview',
  imports: [DatePipe, MatCardModule, MatChipsModule, MatIconModule, MatProgressBarModule, MatToolbarModule],
  templateUrl: './group-page.html',
  styleUrl: './group-page.css',
})
export class GroupPreviewComponent {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly routeErrors = inject(RouteErrorService);

  readonly emoji = inject(EmojiService);
  readonly state = signal<GroupPreviewState>({ status: 'loading' });
  readonly events = computed(() => {
    const state = this.state();
    if (state.status !== 'ready') {
      return [];
    }

    return [...state.preview.events].sort((left, right) => compareIsoDateAsc(left.startDate, right.startDate));
  });

  constructor() {
    const previewToken = this.route.snapshot.paramMap.get('previewToken');
    if (!previewToken) {
      void this.routeErrors.navigate(404);
      return;
    }

    this.api
      .getPreviewGroup(previewToken)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (preview) => this.state.set({ status: 'ready', preview }),
        error: (error: unknown) => {
          void this.routeErrors.navigate(privateResourceErrorStatus(error));
        },
      });
  }

  dateLine(event: { startDate: string; endDate: string }): string {
    return formatDateRange(event.startDate, event.endDate);
  }

  typeLabel(type: string): string {
    return getEventTypeLabel(type);
  }
}
