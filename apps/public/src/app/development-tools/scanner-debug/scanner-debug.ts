import { Component, DestroyRef, inject, signal, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { AztecScannerDialogComponent, ScannerSoundsService } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-scanner-debug',
  imports: [MatButtonModule, MatToolbar, MatIcon, RouterLink],
  templateUrl: './scanner-debug.html',
  styleUrl: './scanner-debug.css',
})
export class ScannerDebug {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  public readonly scannerSoundsService = inject(ScannerSoundsService);
  public scannedCode: WritableSignal<string | null> = signal(null);

  scanCode(): void {
    const dialogRef = this.dialog.open(AztecScannerDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      data: {
        title: 'Debug Scanner',
      },
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((code) => {
        if (!code && code !== '') {
          this.scannerSoundsService.invalid();
          return;
        }

        this.scannerSoundsService.valid();
        this.scannedCode.set(code);
      });
  }
}
