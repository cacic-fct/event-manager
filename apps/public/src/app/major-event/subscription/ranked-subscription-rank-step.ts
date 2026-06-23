import { DragDropModule } from '@angular/cdk/drag-drop';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import type { PublicEvent } from '@cacic-fct/event-manager-public-contracts';
import { CloudflareTurnstileComponent } from '@cacic-fct/shared-angular';
import { EmojiService } from '../../shared/emoji.service';
import { RankedSubscriptionStore } from './ranked-subscription.store';

@Component({
  selector: 'app-ranked-subscription-rank-step',
  imports: [
    CurrencyPipe,
    DatePipe,
    DragDropModule,
    MatButtonModule,
    MatIconModule,
    MatRadioModule,
    CloudflareTurnstileComponent,
  ],
  templateUrl: './ranked-subscription-rank-step.html',
  styleUrls: ['./subscription.css', './ranked-subscription.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RankedSubscriptionRankStep {
  readonly store = inject(RankedSubscriptionStore);
  readonly emoji = inject(EmojiService);
  readonly back = output<void>();
  private readonly turnstileWidget = viewChild(CloudflareTurnstileComponent);

  isFirstDescriptionOccurrence(events: PublicEvent[], event: PublicEvent): boolean {
    const description = event.shortDescription?.trim();
    if (!description) {
      return false;
    }
    return events.find((item) => item.shortDescription?.trim() === description)?.id === event.id;
  }

  submit(): void {
    this.store.submit(() => this.turnstileWidget()?.reset());
  }
}
