import { Component, computed, effect, inject, isDevMode, signal } from '@angular/core';
import { MatListModule } from '@angular/material/list';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '@cacic-fct/shared-angular';
import { OfflineUserSnapshot } from '@cacic-fct/offline-public-data-access';
import { MatButtonModule } from '@angular/material/button';
import { NetworkStatusService } from '../../shared/network-status.service';
import { OfflineUserDataService } from '../../shared/offline-user-data.service';
import { AttendanceCollectionApiService } from '../../attendance/collection/attendance-collection-api.service';

@Component({
  selector: 'app-menu.component',
  imports: [MatListModule, RouterLink, MatCardModule, MatIconModule, MatButtonModule],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css',
})
export class MenuComponent {
  readonly authService = inject(AuthService);
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineUserData = inject(OfflineUserDataService);
  private readonly attendanceCollectionApi = inject(AttendanceCollectionApiService);
  private readonly offlineSnapshot = signal<OfflineUserSnapshot | null>(null);
  readonly canCollectAttendances = signal(false);
  public isDevMode = isDevMode();

  readonly isProfileAvailable = computed(() => this.authService.isAuthenticated() || Boolean(this.offlineSnapshot()));
  readonly displayUser = computed(() => {
    const user = this.authService.user();
    if (user) {
      return {
        name: typeof user.claims?.['name'] === 'string' ? user.claims['name'] : 'Desconhecido',
        picture: typeof user.claims?.['picture'] === 'string' ? user.claims['picture'] : null,
      };
    }

    const snapshot = this.offlineSnapshot();
    return snapshot
      ? {
          name: snapshot.name ?? 'Desconhecido',
          picture: snapshot.picture,
        }
      : null;
  });

  constructor() {
    effect(() => {
      if (this.authService.isAuthenticated() || this.networkStatus.isOnline()) {
        this.offlineSnapshot.set(null);
        return;
      }

      void this.offlineUserData.getOfflineSnapshot().then((snapshot) => this.offlineSnapshot.set(snapshot));
    });

    effect((onCleanup) => {
      if (!this.authService.isAuthenticated()) {
        this.canCollectAttendances.set(false);
        return;
      }

      const subscription = this.attendanceCollectionApi.listCollectionEvents().subscribe({
        next: (events) => this.canCollectAttendances.set(events.length > 0),
        error: () => this.canCollectAttendances.set(false),
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
