import { Component, DestroyRef, inject, signal, WritableSignal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatToolbar } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { AztecScannerDialogComponent, ScannerFeedbackKind, ScannerFeedbackService } from '@cacic-fct/shared-angular';

@Component({
  selector: 'app-scanner-debug',
  imports: [MatButtonModule, MatToolbar, MatIcon, RouterLink],
  templateUrl: './scanner-debug.html',
  styleUrl: './scanner-debug.css',
})
export class ScannerDebug {
  private readonly dialog = inject(MatDialog);
  private readonly destroyRef = inject(DestroyRef);
  private readonly scannerFeedback = inject(ScannerFeedbackService);
  public scannedCode: WritableSignal<string | null> = signal(null);

  scanCode(): void {
    const dialogRef = this.dialog.open(AztecScannerDialogComponent, {
      width: 'min(560px, 96vw)',
      maxWidth: '96vw',
      data: {
        title: 'Debug Scanner',
        mode: ['Aztec', 'QRCode'],
      },
    });

    dialogRef
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((code) => {
        if (!code && code !== '') {
          this.showFeedback('invalid');
          return;
        }

        this.showFeedback('valid');
        this.scannedCode.set(code);
      });
  }

  showFeedback(kind: ScannerFeedbackKind): void {
    this.scannerFeedback.show(kind);
  }
}
