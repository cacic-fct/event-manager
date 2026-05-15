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
} from '@cacic-fct/shared-utils';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflinePublicDataAccessService } from '@cacic-fct/offline-public-data-access';
import { catchError, from, map, of, startWith, switchMap } from 'rxjs';
import { NetworkStatusService } from '../../shared/network-status.service';
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
  imports: [MatIconModule, MatListModule, MatProgressBarModule, RouterLink, MatToolbarModule, MatButtonModule],
})
export class Attendances {
  private readonly api = inject(AttendancesApiService);
  private readonly auth = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineData = inject(OfflinePublicDataAccessService);
  readonly emoji = inject(EmojiService);

  readonly feedState = toSignal(
    this.loadFeed().pipe(
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
          message: error instanceof Error ? error.message : 'Não foi possível carregar suas inscrições.',
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

  itemStatusLine(item: SubscribedItem, attendances: SubscriptionsFeed['attendances']): string {
    return getSubscribedItemStatusLine(item, attendances);
  }

  majorEventDateLine(subscription: CurrentUserMajorEventFeedItem): string {
    return getMajorEventDateLine(subscription);
  }

  majorEventStatusLine(subscription: CurrentUserMajorEventFeedItem): string {
    return getMajorEventStatusLine(subscription);
  }

  private loadFeed() {
    const userId = this.auth.user()?.sub;

    if (!this.networkStatus.isOnline()) {
      return from(this.loadOfflineFeed());
    }

    if (!userId) {
      void this.offlineData.purgeUserData();
      return of({
        majorEventItems: [],
        eventItems: [],
        attendances: [],
      } satisfies SubscriptionsFeed);
    }

    return this.api
      .getSubscriptionsFeed()
      .pipe(
        switchMap((feed) => from(this.offlineData.replaceAttendanceFeed(userId, feed)).pipe(map(() => feed))),
        catchError(() => from(this.loadOfflineFeed())),
      );
  }

  private async loadOfflineFeed(): Promise<SubscriptionsFeed> {
    const userId = this.auth.user()?.sub ?? (await this.offlineData.getLatestUserSnapshot())?.userId;
    const feed = userId ? await this.offlineData.getAttendanceFeed(userId) : null;

    return (
      feed ?? {
        majorEventItems: [],
        eventItems: [],
        attendances: [],
      }
    );
  }
}
