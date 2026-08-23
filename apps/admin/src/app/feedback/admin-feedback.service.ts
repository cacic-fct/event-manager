import { Service, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { getErrorMessage } from './error-message';
import { AdminErrorDialogComponent, type AdminErrorDialogData } from './error-dialog.component';

@Service()
export class AdminFeedbackService {
  private readonly dialog = inject(MatDialog);
  private readonly queue: AdminErrorDialogData[] = [];
  private activeMessage: string | null = null;

  error(error: unknown, fallback: string, title = 'Não foi possível concluir a operação'): void {
    this.showErrorMessage(getErrorMessage(error, fallback), title);
  }

  showErrorMessage(message: string, title = 'Não foi possível concluir a operação'): void {
    if (message === this.activeMessage || this.queue.some((item) => item.message === message)) {
      return;
    }

    const data = { title, message };
    if (this.activeMessage) {
      this.queue.push(data);
      return;
    }

    this.open(data);
  }

  private open(data: AdminErrorDialogData): void {
    this.activeMessage = data.message;
    this.dialog
      .open(AdminErrorDialogComponent, {
        data,
        maxWidth: 'min(92vw, 36rem)',
        width: '100%',
        ariaLabel: data.title,
        autoFocus: 'dialog',
        restoreFocus: true,
      })
      .afterClosed()
      .subscribe(() => {
        this.activeMessage = null;
        const next = this.queue.shift();
        if (next) {
          this.open(next);
        }
      });
  }
}
