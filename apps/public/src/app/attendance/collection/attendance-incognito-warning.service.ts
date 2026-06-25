import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { AttendanceIncognitoWarningDialog } from './attendance-incognito-warning.dialog';

const WARNING_SESSION_KEY = 'cacic-eventos:attendance-incognito-warning-shown';

@Injectable({ providedIn: 'root' })
export class AttendanceIncognitoWarningService {
  private readonly dialog = inject(MatDialog);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);
  private checked = false;

  async warnIfPrivateBrowsing(): Promise<void> {
    if (!this.isBrowser || this.checked || this.hasWarningMarker()) {
      return;
    }

    this.checked = true;
    const { detectIncognito } = await import('detectincognitojs');
    const result = await detectIncognito();
    if (!result.isPrivate) {
      return;
    }

    await firstValueFrom(
      this.dialog
        .open(AttendanceIncognitoWarningDialog, {
          width: 'min(28rem, 94vw)',
          disableClose: true,
          data: { step: 1 },
        })
        .afterClosed(),
    );
    await firstValueFrom(
      this.dialog
        .open(AttendanceIncognitoWarningDialog, {
          width: 'min(28rem, 94vw)',
          disableClose: true,
          data: { step: 2 },
        })
        .afterClosed(),
    );

    this.setWarningMarker();
  }

  private hasWarningMarker(): boolean {
    try {
      return window.sessionStorage.getItem(WARNING_SESSION_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private setWarningMarker(): void {
    try {
      window.sessionStorage.setItem(WARNING_SESSION_KEY, 'true');
    } catch {
      return;
    }
  }
}
