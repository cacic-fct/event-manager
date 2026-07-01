import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { compareIsoDateAsc, formatDateRange, getEventTypeLabel } from '@cacic-fct/shared-utils';
import { EmojiService } from '../shared/emoji.service';
import {
  MajorEventSubscriptionApiService,
  PublicContentGroupPreview,
} from '../major-event/subscription/subscription-api.service';

type GroupPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; preview: PublicContentGroupPreview }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-group-preview',
  imports: [DatePipe, MatCardModule, MatChipsModule, MatIconModule, MatProgressBarModule, MatToolbarModule],
  templateUrl: './group-preview.component.html',
  styleUrl: './group-preview.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GroupPreviewComponent {
  private readonly api = inject(MajorEventSubscriptionApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

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
      this.state.set({ status: 'error', message: 'Pré-visualização inválida.' });
      return;
    }

    this.api
      .getPreviewGroup(previewToken)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (preview) => this.state.set({ status: 'ready', preview }),
        error: (error: unknown) =>
          this.state.set({
            status: 'error',
            message: error instanceof Error ? error.message : 'Não foi possível carregar a pré-visualização.',
          }),
      });
  }

  dateLine(event: { startDate: string; endDate: string }): string {
    return formatDateRange(event.startDate, event.endDate);
  }

  typeLabel(type: string): string {
    return getEventTypeLabel(type);
  }
}
