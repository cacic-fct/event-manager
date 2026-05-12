import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export interface RealtimeEventMessage<TPayload = unknown> {
  type?: string;
  channel?: string;
  event?: string;
  majorEventId?: string;
  payload?: TPayload;
}

@Injectable({ providedIn: 'root' })
export class RealtimeEventsService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly messages = new Subject<RealtimeEventMessage>();
  private readonly watchedMajorEventIds = new Map<string, number>();
  private source: EventSource | null = null;

  watch(): Observable<RealtimeEventMessage> {
    this.connect();
    return this.messages.asObservable();
  }

  watchMajorEvent(majorEventId: string): Observable<RealtimeEventMessage> {
    return new Observable((subscriber) => {
      this.addMajorEvent(majorEventId);
      const subscription = this.watch().subscribe(subscriber);

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
      if (this.source?.readyState === EventSource.CLOSED) {
        this.reconnect();
      }
    };
  }

  disconnect(): void {
    this.source?.close();
    this.source = null;
  }

  private addMajorEvent(majorEventId: string): void {
    this.watchedMajorEventIds.set(majorEventId, (this.watchedMajorEventIds.get(majorEventId) ?? 0) + 1);
    this.reconnect();
  }

  private removeMajorEvent(majorEventId: string): void {
    const currentCount = this.watchedMajorEventIds.get(majorEventId) ?? 0;
    if (currentCount <= 1) {
      this.watchedMajorEventIds.delete(majorEventId);
    } else {
      this.watchedMajorEventIds.set(majorEventId, currentCount - 1);
    }
    this.reconnect();
  }

  private reconnect(): void {
    if (!isPlatformBrowser(this.platformId) || !this.source) {
      return;
    }

    this.disconnect();
    this.connect();
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
      return;
    }
  }
}
