import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@cacic-eventos/shared-angular';
import { catchError, of, take } from 'rxjs';
import { OnlineAttendanceApiService } from './online-attendance-api.service';

interface AttendanceSocketMessage {
  type?: string;
  channel?: string;
  event?: string;
  payload?: {
    eventIds?: string[];
  };
}

const ONLINE_ATTENDANCE_CHANNEL = 'current-user.online-attendance';

@Injectable({ providedIn: 'root' })
export class OnlineAttendanceCoordinatorService {
  private readonly api = inject(OnlineAttendanceApiService);
  private readonly auth = inject(AuthService);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly router = inject(Router);
  private readonly interruptedStorageKey =
    'cacic-eventos:online-attendance-interrupted';

  private socket: WebSocket | null = null;

  constructor() {
    effect(() => {
      if (this.auth.isAuthenticated()) {
        this.connect();
        this.maybeInterrupt();
        return;
      }

      this.disconnect();
    });
  }

  start(): void {
    if (this.auth.isAuthenticated()) {
      this.connect();
      this.maybeInterrupt();
    }
  }

  navigateToPending(returnUrl = this.currentUrl(), interrupt = false): void {
    this.api
      .listPendingEvents()
      .pipe(
        take(1),
        catchError(() => of([])),
      )
      .subscribe((items) => {
        if (items.length === 0) {
          return;
        }

        if (interrupt && isPlatformBrowser(this.platformId)) {
          window.sessionStorage.setItem(this.interruptedStorageKey, 'true');
        }

        const target =
          items.length === 1
            ? ['/attendance/register', items[0].eventId]
            : ['/attendance/register'];

        void this.router.navigate(target, {
          queryParams: {
            returnUrl,
          },
        });
      });
  }

  private maybeInterrupt(): void {
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (window.sessionStorage.getItem(this.interruptedStorageKey)) {
      return;
    }

    if (this.router.url.startsWith('/attendance/register')) {
      return;
    }

    this.navigateToPending(this.currentUrl(), true);
  }

  private connect(): void {
    if (!isPlatformBrowser(this.platformId) || this.socket) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.socket = new WebSocket(
      `${protocol}//${window.location.host}/api/public/ws`,
    );
    this.socket.addEventListener('open', () => {
      this.socket?.send(
        JSON.stringify({
          type: 'subscribe',
          channel: ONLINE_ATTENDANCE_CHANNEL,
        }),
      );
    });
    this.socket.addEventListener('message', (event) => {
      const message = this.parseMessage(event.data);
      if (
        message?.type === 'event' &&
        message.channel === ONLINE_ATTENDANCE_CHANNEL &&
        message.event === 'pendingOnlineAttendancesChanged' &&
        message.payload?.eventIds?.length
      ) {
        this.maybeInterrupt();
      }
    });
    this.socket.addEventListener('close', () => {
      this.socket = null;
    });
  }

  private disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }

  private currentUrl(): string {
    return this.router.url || '/menu';
  }

  private parseMessage(data: unknown): AttendanceSocketMessage | null {
    if (typeof data !== 'string') {
      return null;
    }

    try {
      return JSON.parse(data) as AttendanceSocketMessage;
    } catch {
      return null;
    }
  }
}
