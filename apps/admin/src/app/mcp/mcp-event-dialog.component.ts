import { Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { EventContextPickerComponent, type EventContextRef } from '../shared/event-context-picker.component';

@Component({
  selector: 'app-mcp-event-dialog',
  imports: [MatButtonModule, MatDialogModule, EventContextPickerComponent],
  template: `
    <h2 mat-dialog-title>Escolher evento para autorização</h2>
    <mat-dialog-content>
      <p>Escolha um evento específico. Expanda grupos e grandes eventos para encontrar seus eventos.</p>
      @if (selectionError()) {
        <p role="alert">{{ selectionError() }}</p>
      }
      <app-event-context-picker [searchOnly]="true" [allowGroups]="false" (contextChange)="select($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
    </mat-dialog-actions>
  `,
})
export class McpEventDialogComponent {
  private readonly dialog = inject<MatDialogRef<McpEventDialogComponent, EventContextRef>>(MatDialogRef);
  readonly selectionError = signal('');

  select(context: EventContextRef): void {
    if (context.kind !== 'event') {
      this.selectionError.set(
        'Selecione um evento dentro deste contexto. Grupos e grandes eventos não recebem autorização.',
      );
      return;
    }
    this.dialog.close(context);
  }
}
