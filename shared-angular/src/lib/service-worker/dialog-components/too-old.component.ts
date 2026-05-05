import { Component, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  standalone: true,
  selector: 'lib-too-old-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>A versão do seu aplicativo é muito antiga</h2>

    <mat-dialog-content>
      <p>Uma atualização é necessária para continuar utilizando-o.</p>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-flat-button color="primary" (click)="reload()">OK</button>
    </mat-dialog-actions>
  `,
})
export class TooOldDialogComponent {
  private readonly document: Document = inject(DOCUMENT);

  reload(): void {
    this.document.location.reload();
  }
}
