import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Router, RouterLink } from '@angular/router';
import { AttendanceCollectionApiService, AttendanceCollectionEvent } from './attendance-collection-api.service';
import { EmojiService } from '../../shared/emoji.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AttendanceCollectionAccessService } from './attendance-collection-access.service';
import { AttendanceOfflineQueueService } from '@cacic-fct/offline-public-data-access';
import { AuthService } from '@cacic-fct/shared-angular';
import { addHours, isValid, parseISO, subHours } from 'date-fns';

@Component({
  selector: 'app-scanner-event-list',
  imports: [DatePipe, RouterLink, MatIconModule, MatListModule, MatToolbarModule, MatButtonModule, MatSnackBarModule],
  templateUrl: './scanner-event-list.html',
  styleUrl: './scanner-event-list.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ScannerEventList implements OnInit {
  private readonly access = inject(AttendanceCollectionAccessService);
  private readonly api = inject(AttendanceCollectionApiService);
  private readonly auth = inject(AuthService);
  private readonly offlineQueue = inject(AttendanceOfflineQueueService);
  private readonly router = inject(Router);
  private readonly snackbar = inject(MatSnackBar);
  readonly emoji = inject(EmojiService);

  readonly events = signal<AttendanceCollectionEvent[]>([]);
  readonly loading = signal(true);
  readonly locationStatus = signal('Solicitando localização precisa.');
  readonly hasPreciseLocation = signal(false);
  readonly hasEvents = computed(() => this.events().length > 0);

  ngOnInit(): void {
    void this.requestPreciseLocation();

    this.api.listCollectionEvents().subscribe({
      next: (events) => {
        this.events.set(events);
        this.loading.set(false);
        const userId = this.auth.user()?.sub;
        if (userId) {
          void this.offlineQueue.replaceCollectionEvents(userId, events);
        }
      },
      error: () => void this.loadCachedEvents(),
    });
  }

  protected isCollectionOpen(item: AttendanceCollectionEvent): boolean {
    return this.access.isCollectionOpen(item);
  }

  protected collectionWindowLabel(item: AttendanceCollectionEvent): string {
    const start = parseISO(item.event.startDate);
    const end = parseISO(item.event.endDate);

    if (!isValid(start) || !isValid(end)) {
      return 'Coleta de presença';
    }

    const allowedStart = subHours(start, 3);
    const allowedEnd = addHours(end, 6);
    return `Coleta de presença: ${this.formatHour(allowedStart)}-${this.formatHour(allowedEnd)}`;
  }

  protected canOpen(item: AttendanceCollectionEvent): boolean {
    return this.hasPreciseLocation() && this.isCollectionOpen(item);
  }

  protected async openEvent(item: AttendanceCollectionEvent): Promise<void> {
    if (!this.isCollectionOpen(item)) {
      this.snackbar.open('A coleta de presença não está aberta para este evento.', 'Fechar', { duration: 4000 });
      return;
    }

    if (!this.hasPreciseLocation()) {
      await this.requestPreciseLocation();
    }

    if (!this.hasPreciseLocation()) {
      return;
    }

    await this.router.navigate(['/attendance/collect', item.eventId]);
  }

  protected async requestPreciseLocation(): Promise<void> {
    this.locationStatus.set('Solicitando localização precisa.');
    try {
      const location = await this.access.getPreciseLocation();
      this.hasPreciseLocation.set(true);
      this.locationStatus.set(`Localização precisa ativa (${Math.round(location.accuracyMeters)} m).`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Browser didn't provide location.";
      this.hasPreciseLocation.set(false);
      this.locationStatus.set(message);
      this.snackbar.open(message, 'Fechar', { duration: 5000 });
    }
  }

  private async loadCachedEvents(): Promise<void> {
    const userId = this.auth.user()?.sub;
    const events = userId ? await this.offlineQueue.getCollectionEvents(userId) : [];
    this.events.set(events);
    this.loading.set(false);
  }

  private formatHour(date: Date): string {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }
}
