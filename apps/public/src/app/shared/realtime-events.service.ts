import { isPlatformBrowser } from '@angular/common';
import { Injectable, OnDestroy, PLATFORM_ID, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface RealtimeEventMessage<TPayload = unknown> {
  type?: string;
  channel?: string;
  event?: string;
  majorEventId?: string;
  payload?: TPayload;
}

@Injectable({ providedIn: 'root' })
export class RealtimeEventsService implements OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly messages = new Subject<RealtimeEventMessage>();

  private readonly watchedMajorEventIds = new Map<string, number>();

  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private globalWatchers = 0;

  watch(): Observable<RealtimeEventMessage> {
    return new Observable((subscriber) => {
      this.globalWatchers++;
      this.connect();

      const subscription = this.messages.subscribe(subscriber);

      return () => {
        subscription.unsubscribe();
        this.globalWatchers--;

        if (!this.hasActiveWatchers()) {
          this.disconnect();
        }
      };
    });
  }

  watchMajorEvent(majorEventId: string): Observable<RealtimeEventMessage> {
    return new Observable((subscriber) => {
      this.addMajorEvent(majorEventId);

      const subscription = this.messages.subscribe((message) => {
        if (!message.majorEventId || message.majorEventId === majorEventId) {
          subscriber.next(message);
        }
      });

      return () => {
        subscription.unsubscribe();
        this.removeMajorEvent(majorEventId);
      };
    });
  }

  connect(): void {
    if (!isPlatformBrowser(this.platformId) || this.source) {
      return;
    }

    this.source = new EventSource(this.buildUrl());

    this.source.onmessage = (event) => {
      this.emitMessage(event.data);
    };

    this.source.onerror = () => {
      // Native EventSource already retries automatically.
      // Do not manually reconnect here, or we may fight browser retry behavior.
    };
  }

  disconnect(): void {
    this.clearReconnectTimer();

    this.source?.close();
    this.source = null;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.messages.complete();
  }

  private addMajorEvent(majorEventId: string): void {
    const count = this.watchedMajorEventIds.get(majorEventId) ?? 0;
    this.watchedMajorEventIds.set(majorEventId, count + 1);

    this.scheduleReconnect();
  }

  private removeMajorEvent(majorEventId: string): void {
    const count = this.watchedMajorEventIds.get(majorEventId) ?? 0;

    if (count <= 1) {
      this.watchedMajorEventIds.delete(majorEventId);
    } else {
      this.watchedMajorEventIds.set(majorEventId, count - 1);
    }

    if (this.hasActiveWatchers()) {
      this.scheduleReconnect();
    } else {
      this.disconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.clearReconnectTimer();

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect();
    }, 100);
  }

  private reconnect(): void {
    if (!isPlatformBrowser(this.platformId) || !this.hasActiveWatchers()) {
      return;
    }

    this.source?.close();
    this.source = null;

    this.connect();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private hasActiveWatchers(): boolean {
    return this.globalWatchers > 0 || this.watchedMajorEventIds.size > 0;
  }

  private buildUrl(): string {
    const url = new URL('/api/public/events', window.location.origin);
    const majorEventIds = [...this.watchedMajorEventIds.keys()];

    if (majorEventIds.length > 0) {
      url.searchParams.set('majorEventIds', majorEventIds.join(','));
    }

    return url.toString();
  }

  private emitMessage(data: string): void {
    try {
      const message = JSON.parse(data) as RealtimeEventMessage;

      if (message.type === 'heartbeat') {
        return;
      }

      this.messages.next(message);
    } catch {
      // Ignore malformed SSE payloads.
    }
  }
}
