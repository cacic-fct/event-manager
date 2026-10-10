import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface TicketAdminReasonDialogData {
  title: string;
  actionLabel: string;
  description: string;
}

@Component({
  selector: 'app-ticket-admin-reason-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.description }}</p>
      <mat-form-field appearance="outline">
        <mat-label>Motivo para auditoria</mat-label>
        <textarea matInput rows="3" maxlength="500" [formControl]="reasonControl" required></textarea>
        <mat-hint>O motivo ficará no histórico administrativo do bilhete.</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="button" [disabled]="reasonControl.invalid || !reasonControl.value.trim()" [mat-dialog-close]="reasonControl.value.trim()">
        {{ data.actionLabel }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { display:grid; gap:0.75rem; }
    mat-form-field { width:100%; }
  `,
})
export class TicketAdminReasonDialogComponent {
  protected readonly data = inject<TicketAdminReasonDialogData>(MAT_DIALOG_DATA);
  private readonly formBuilder = inject(FormBuilder);
  protected readonly reasonControl = this.formBuilder.nonNullable.control('', [Validators.required, Validators.maxLength(500)]);
}
