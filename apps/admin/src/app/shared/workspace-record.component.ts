import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, type Params } from '@angular/router';

let nextWorkspaceRecordId = 0;

/** A record destination or local selection, with independent secondary actions. */
@Component({
  selector: 'app-workspace-record',
  host: { '(click)': '$event.stopPropagation()' },
  imports: [MatButtonModule, NgTemplateOutlet, RouterLink],
  template: `
    <div class="record" [class.selected]="selected()">
      @if (readonly()) {
        <div class="record-main"><ng-container [ngTemplateOutlet]="content" /></div>
      } @else if (link(); as destination) {
        <a mat-button class="record-main"
          [routerLink]="disabled() ? null : destination"
          [queryParams]="queryParams()"
          [disabled]="disabled()"
          [attr.aria-label]="label() || title()"
          [attr.aria-describedby]="descriptionId"
          [attr.aria-current]="selected() ? 'page' : null">
          <ng-container [ngTemplateOutlet]="content" />
        </a>
      } @else {
        <button
        mat-button
        class="record-main"
        type="button"
        [disabled]="disabled()"
        [attr.aria-label]="label() || title()"
        [attr.aria-describedby]="descriptionId"
        [attr.aria-pressed]="selected()"
        (click)="activate.emit()">
          <ng-container [ngTemplateOutlet]="content" />
        </button>
      }
      <ng-template #content>
        <span class="record-content">
          <span class="record-title"><ng-content select="[recordIcon]" />{{ title() }}</span>
          <span class="record-description" [id]="descriptionId"><ng-content select="[recordDescription]" /></span>
        </span>
      </ng-template>
      <div class="record-actions"><ng-content select="[recordActions]" /></div>
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .record { display: flex; align-items: center; min-width: 0; border-radius: 8px; }
    .record.selected { background: var(--mat-sys-secondary-container); }
    .record-main { flex: 1; min-width: 0; height: auto; min-height: 64px; padding: 0.75rem;
      justify-content: flex-start; text-align: start; white-space: normal; border-radius: 8px;
      color: var(--mat-sys-on-surface); }
    .record.selected .record-main { color: var(--mat-sys-on-secondary-container); }
    .record-content { display: grid; gap: 0.25rem; min-width: 0; }
    .record-main:not(:disabled) .record-content { color: var(--mat-sys-on-surface); }
    .record.selected .record-main:not(:disabled) .record-content { color: var(--mat-sys-on-secondary-container); }
    .record-title { display: flex; align-items: baseline; gap: 0.5rem; font: var(--mat-sys-title-small);
      overflow-wrap: anywhere; }
    .record-description { display: block; font: var(--mat-sys-body-small); overflow-wrap: anywhere; }
    .record-description:empty, .record-actions:empty { display: none; }
    .record-actions { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; padding-inline-end: 0.25rem; }
    @media (max-width: 480px) {
      .record { flex-wrap: wrap; }
      .record-main { flex-basis: 100%; }
      .record-actions { padding: 0 0.5rem 0.5rem; }
    }
  `,
})
export class WorkspaceRecordComponent {
  readonly descriptionId = `workspace-record-description-${nextWorkspaceRecordId++}`;
  readonly title = input.required<string>();
  readonly label = input('');
  readonly selected = input(false);
  readonly readonly = input(false);
  readonly disabled = input(false);
  readonly link = input<string | string[] | null>(null);
  readonly queryParams = input<Params | null>(null);
  readonly activate = output<void>();
}
