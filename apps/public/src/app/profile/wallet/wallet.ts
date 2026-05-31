import { Component, PLATFORM_ID, Signal, computed, effect, inject, signal } from '@angular/core';
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
import { OfflineUserSnapshot } from '@cacic-fct/offline-public-data-access';
import { formatCPF, isValidCPF } from '@cacic-fct/shared-utils';

import { PrintDialog } from './print-dialog';
import { NetworkStatusService } from '../../shared/network-status.service';
import { OfflineUserDataService } from '../../shared/offline-user-data.service';

@Component({
  selector: 'app-wallet',
  imports: [SafePipe, MatToolbarModule, MatIconModule, RouterLink, MatButtonModule, MatCardModule, MatDialogModule],
  templateUrl: './wallet.html',
  styleUrl: './wallet.css',
})
export class Wallet {
  public readonly authService = inject(AuthService);
  public readonly serviceWorkerService = inject(ServiceWorkerService);

  private readonly networkStatus = inject(NetworkStatusService);
  private readonly offlineUserData = inject(OfflineUserDataService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly offlineSnapshot = signal<OfflineUserSnapshot | null>(null);

  // TODO: Move this to a shared lib
  private readonly roleLabels: Record<string, string> = {
    'aluno-pos-graduacao': 'Aluno da pós-graduação',
    egresso: 'Egresso',
    professor: 'Professor',
    'professor-substituto': 'Professor substituto',
    'servidor-tecnico-administrativo': 'Servidor técnico-administrativo',
    external: 'Externo',
  };

  private readonly graduationCourses: Record<string, string> = {
    '12': 'Aluno de Ciência da Computação',
  };

  readonly formatRole = computed(() => {
    const user = this.cardUser();

    const role = Array.isArray(user?.unespRole) ? user.unespRole[0] : user?.unespRole;

    if (role === 'aluno-graduacao') {
      const courseCode = user?.enrollmentNumber?.substring(2, 4);

      return this.graduationCourses[courseCode ?? ''] ?? 'Aluno da Graduação';
    }

    return this.roleLabels[role ?? ''] ?? role?.toString() ?? '';
  });
  private get isBrowser(): boolean {
    return isPlatformBrowser(this.platformId);
  }

  public readonly profileBarcode: Signal<string> = computed(() => {
    const user = this.cardUser();

    if (!user?.userId || !this.isBrowser) {
      return '';
    }

    return this.renderAztecCode(user.userId, '35');
  });

  public readonly printProfileBarcode: Signal<string> = computed(() => {
    const user = this.cardUser();

    if (!user?.userId || !this.isBrowser) {
      return '';
    }

    return this.renderAztecCode(user.userId, '60');
  });

  public readonly cardUser = computed(() => {
    const user = this.authService.user();
    if (user?.sub) {
      return {
        userId: user.sub,
        name: typeof user.claims?.name === 'string' ? user.claims.name : null,
        picture: typeof user.claims?.['picture'] === 'string' ? user.claims['picture'] : null,
        unespRole: user.claims?.['unesp_role'] ?? null,
        identityDocument: typeof user.claims?.identity_document === 'string' ? user.claims.identity_document : null,
        enrollmentNumber: user.claims?.enrollment_number ?? null,
      };
    }

    const snapshot = this.offlineSnapshot();

    return snapshot
      ? {
          userId: snapshot.userId,
          name: snapshot.name,
          picture: snapshot.picture,
          unespRole: snapshot.unespRole,
          identityDocument: snapshot.identityDocument,
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
  }

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

  public roleLine(role: string | string[] | null | undefined): string {
    if (Array.isArray(role)) {
      return role.join(', ');
    }

    return role ?? '';
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

    this.snackBar.open(
      'Você precisará de uma conexão com a internet para acessar esta página. O Service Worker não está disponível.',
      'Fechar',
      {
        duration: 5000,
      },
    );
  }
}
