import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RouterLink } from '@angular/router';
import {
  CurrentUserMajorEventFeedItem,
  SubscribedItem,
  SubscriptionsFeed,
  getMajorEventDateLine,
  getMajorEventStatusLine,
  getSubscribedItemDateLine,
  getSubscribedItemEmoji,
  getSubscribedItemStatusLine,
  getSubscribedItemTitle,
  sortSubscriptionsFeed,
} from '@cacic-eventos/shared-utils';
import { catchError, map, of, startWith } from 'rxjs';
import { AttendancesApiService } from './attendances-api.service';
import { EmojiService } from './emoji.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';

type FeedState =
  | { status: 'loading' }
  | { status: 'ready'; data: SubscriptionsFeed }
  | { status: 'error'; message: string };

@Component({
  selector: 'app-attendances',
  templateUrl: './attendances.html',
  styleUrl: './attendances.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatIconModule,
    MatListModule,
    MatProgressBarModule,
    RouterLink,
    MatToolbarModule,
    MatButtonModule,
  ],
})
export class Attendances {
  private readonly api = inject(AttendancesApiService);
  readonly emoji = inject(EmojiService);

  readonly feedState = toSignal(
    this.api.getSubscriptionsFeed().pipe(
      map(
        (feed): FeedState => ({
          status: 'ready',
          data: sortSubscriptionsFeed(feed),
        }),
      ),
      startWith({ status: 'loading' } satisfies FeedState),
      catchError((error: unknown) =>
        of({
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar suas inscrições.',
        } satisfies FeedState),
      ),
    ),
    { initialValue: { status: 'loading' } satisfies FeedState },
  );

  majorEventRoute(subscription: CurrentUserMajorEventFeedItem): string[] {
    return ['./major-event', subscription.majorEvent.id];
  }

  itemRoute(item: SubscribedItem): string[] {
    if (item.__typename === 'SubscribedSingleEventItem') {
      return ['./event', item.event.id];
    }

    return ['./event-group', item.eventGroup.id];
  }

  itemEmoji(item: SubscribedItem): string {
    return getSubscribedItemEmoji(item);
  }

  itemTitle(item: SubscribedItem): string {
    return getSubscribedItemTitle(item);
  }

  itemDateLine(item: SubscribedItem): string {
    return getSubscribedItemDateLine(item);
  }

  itemStatusLine(
    item: SubscribedItem,
    attendances: SubscriptionsFeed['attendances'],
  ): string {
    return getSubscribedItemStatusLine(item, attendances);
  }

  majorEventDateLine(subscription: CurrentUserMajorEventFeedItem): string {
    return getMajorEventDateLine(subscription);
  }

  majorEventStatusLine(subscription: CurrentUserMajorEventFeedItem): string {
    return getMajorEventStatusLine(subscription);
  }
}
