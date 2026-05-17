import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { Router, RouterLink } from '@angular/router';
import { AttendanceCollectionApiService, AttendanceCollectionEvent } from './attendance-collection-api.service';
import { EmojiService } from '../../profile/attendances/emoji.service';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AttendanceCollectionAccessService } from './attendance-collection-access.service';

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
      },
      error: () => this.loading.set(false),
    });
  }

  protected isCollectionOpen(item: AttendanceCollectionEvent): boolean {
    return this.access.isCollectionOpen(item);
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
}
