import {
  Component,
  computed,
  inject,
  PLATFORM_ID,
  Signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { toSVG } from '@bwip-js/browser';
import {
  AuthService,
  SafePipe,
  ServiceWorkerService,
} from '@cacic-eventos/shared-angular';
import { isValidCPF, formatCPF } from '@cacic-eventos/shared-utils';
import { MatCardModule } from '@angular/material/card';
import { isPlatformBrowser } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { PrintDialog } from './print-dialog';

@Component({
  selector: 'app-wallet',
  imports: [
    SafePipe,
    MatToolbarModule,
    MatIconModule,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatDialogModule,
  ],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class Wallet {
  public readonly authService = inject(AuthService);
  public readonly serviceWorkerService = inject(ServiceWorkerService);
  private readonly _snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);

  public readonly profileBarcode: Signal<string> = computed(() => {
    const user = this.authService.user();
    if (!user) return '';

    return this.renderAztecCode();
  });

  renderAztecCode() {
    try {
      const svg = toSVG({
        bcid: 'azteccode',
        text: `user:${this.authService.user()?.sub}`,
        height: 300,
        width: 300,
        includetext: false,
        textxalign: 'center',
        // @ts-expect-error - eclevel actually exists
        eclevel: '30', // Error correction level
      });

      return svg;
    } catch (err) {
      console.error(err);
      return '';
    }
  }

  formatDocument(document: string): string {
    if (isValidCPF(document)) {
      return formatCPF(document);
    }

    return document;
  }

  print() {
    if (this.serviceWorkerService.hasServiceWorker()) {
      this.dialog
        .open<PrintDialog, void, boolean>(PrintDialog, {
          disableClose: true,
          autoFocus: false,
        })
        .afterClosed()
        .subscribe((confirmed) => {
          if (confirmed && isPlatformBrowser(this.platformId)) {
            window.print();
          }
        });

      return;
    }

    if (isPlatformBrowser(this.platformId)) {
      window.print();
    }
  }

  availableOffline() {
    if (this.serviceWorkerService.hasServiceWorker()) {
      this._snackBar.open('Está página está disponível off-line.', 'Fechar', {
        duration: 3000,
      });
    } else {
      this._snackBar.open(
        'Você precisa de uma conexão com a internet para acessar esta página.',
        'Fechar',
        {
          duration: 5000,
        },
      );
    }
  }
}
