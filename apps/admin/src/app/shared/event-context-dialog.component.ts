import { canCreateEventContext } from './event-context-access';
import { PermissionsService } from '../permissions/permissions.service';
import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { EventContextPickerComponent, type EventContextRef } from './event-context-picker.component';

export type EventContextDialogResult = EventContextRef | { create: 'event' | 'group' | 'major-event' };

export interface EventContextDialogData {
  context: EventContextRef | null;
  allowGroups: boolean;
  parentContext?: EventContextRef | null;
  childKind?: 'event' | 'group';
}

@Component({
  selector: 'app-event-context-dialog',
  imports: [MatDialogModule, MatButtonModule, EventContextPickerComponent],
  template: `
    <h2 mat-dialog-title>{{ data.parentContext ? (data.childKind === 'group' ? 'Grupos deste contexto' : 'Eventos deste contexto') : 'Escolher contexto' }}</h2>
    <mat-dialog-content>
      <app-event-context-picker [searchOnly]="true" [context]="data.context"
        [allowGroups]="data.allowGroups" [parentContext]="data.parentContext ?? null" [childKind]="data.childKind ?? null" (contextChange)="select($event)" />
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (canCreate(permissions, 'event') && (!data.parentContext || data.childKind === 'event' && data.parentContext.kind !== 'event')) { <button mat-button type="button" (click)="create('event')">Novo evento</button> }
      @if (canCreate(permissions, 'group') && (!data.parentContext || data.childKind === 'group' && data.parentContext.kind === 'major-event')) { <button mat-button type="button" (click)="create('group')">Novo grupo</button> }
      @if (canCreate(permissions, 'major-event') && !data.parentContext) { <button mat-button type="button" (click)="create('major-event')">Novo grande evento</button> }
      <button mat-button type="button" (click)="cancel()">Cancelar</button>
    </mat-dialog-actions>
  `,
})
export class EventContextDialogComponent {
  protected readonly permissions = inject(PermissionsService);
  protected readonly canCreate = canCreateEventContext;
  readonly data = inject<EventContextDialogData>(MAT_DIALOG_DATA);
  private readonly dialog = inject<MatDialogRef<EventContextDialogComponent, EventContextDialogResult>>(MatDialogRef);

  select(context: EventContextRef): void {
    this.dialog.close(context);
  }

  create(kind: 'event' | 'group' | 'major-event'): void {
    if (!this.canCreate(this.permissions, kind)) return;
    this.dialog.close({ create: kind });
  }

  cancel(): void {
    this.dialog.close();
  }
}
