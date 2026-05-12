import { Component, HostListener, PLATFORM_ID, Signal, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';

import { toSVG } from '@bwip-js/browser';

import { AuthService, SafePipe, ServiceWorkerService } from '@cacic-fct/shared-angular';
import { formatCPF, isValidCPF } from '@cacic-fct/shared-utils';

import { PrintDialog } from './print-dialog';

@Component({
  selector: 'app-wallet',
  imports: [SafePipe, MatToolbarModule, MatIconModule, RouterLink, MatButtonModule, MatCardModule, MatDialogModule],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class Wallet {
  public readonly authService = inject(AuthService);
  public readonly serviceWorkerService = inject(ServiceWorkerService);

  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);

  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  public readonly profileBarcode: Signal<string> = computed(() => {
    const user = this.authService.user();

    if (!user?.sub || !this.isBrowser) {
      return '';
    }

    return this.renderAztecCode(user.sub, '35');
  });

  public readonly printProfileBarcode: Signal<string> = computed(() => {
    const user = this.authService.user();

    if (!user?.sub || !this.isBrowser) {
      return '';
    }

    return this.renderAztecCode(user.sub, '60');
  });

  private renderAztecCode(userSub: string, errorCorrectionLevel: string): string {
    if (!this.isBrowser) {
      return '';
    }

    try {
      // We use bwip here instead of zxing-wasm,
      // because its compressed size is smaller, and it generates code instantly
      return toSVG({
        bcid: 'azteccode',
        text: `user:${userSub}`,
        height: 300,
        width: 300,
        includetext: false,
        textxalign: 'center',
        // @ts-expect-error - bwip-js supports eclevel for azteccode.
        eclevel: errorCorrectionLevel || '90',
      });
    } catch (err) {
      console.error('Failed to render Aztec code:', err);
      return '';
    }
  }

  public formatDocument(document: string): string {
    if (isValidCPF(document)) {
      return formatCPF(document);
    }

    return document;
  }

  public print(): void {
    if (!this.isBrowser) {
      return;
    }

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
  }

  public availableOffline(): void {
    if (!this.isBrowser) {
      return;
    }

    if (this.serviceWorkerService.hasServiceWorker()) {
      this.snackBar.open('Está página está disponível off-line.', 'Fechar', {
        duration: 3000,
      });

      return;
    }

    this.snackBar.open('Você precisa de uma conexão com a internet para acessar esta página.', 'Fechar', {
      duration: 5000,
    });
  }
}
