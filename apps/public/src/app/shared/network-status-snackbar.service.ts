import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { filter, startWith } from 'rxjs';
import { NetworkConnectionStatus, NetworkStatusService } from './network-status.service';

@Injectable({ providedIn: 'root' })
export class NetworkStatusSnackbarService {
  private readonly networkStatus = inject(NetworkStatusService);
  private readonly snackBar = inject(MatSnackBar);

  start(): void {
    let hasSeenInitialStatus = false;

    this.networkStatus
      .watchStatusChanges()
      .pipe(
        startWith(this.networkStatus.status()),
        filter(() => {
          if (!hasSeenInitialStatus) {
            hasSeenInitialStatus = true;
            return false;
          }

          return true;
        }),
      )
      .subscribe((status) => this.showStatus(status));
  }

  private showStatus(status: NetworkConnectionStatus): void {
    this.snackBar.open(status === 'online' ? 'Conexão restaurada.' : 'Você está off-line.', 'Fechar', {
      duration: 3500,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
