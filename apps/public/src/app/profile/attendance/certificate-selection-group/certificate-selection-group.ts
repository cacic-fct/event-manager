import { Component, computed, input, output } from '@angular/core';
import { MatCheckboxModule } from '@angular/material/checkbox';
import type { Certificate } from '@cacic-fct/shared-utils';

@Component({
  selector: 'app-certificate-selection-group',
  imports: [MatCheckboxModule],
  template: `
    <div class="participation-item selection-group">
      <mat-checkbox
        class="group-checkbox"
        [aria-label]="'Selecionar certificados de ' + title()"
        [checked]="allSelected()"
        [indeterminate]="someSelected() && !allSelected()"
        [disabled]="disabled() || certificates().length === 0"
        (change)="selectionChange.emit({ ids: certificateIds(), selected: $event.checked })" />
      @if (emojiUrl()) {
        <div class="emoji-frame">
          <img class="twemoji" [src]="emojiUrl()" alt="" />
        </div>
      }
      <div class="item-content">
        <div class="participation-title">{{ title() }}</div>
        @if (subtitle()) {
          <div class="participation-date">{{ subtitle() }}</div>
        }
        @if (typeLabel()) {
          <div class="participation-type">{{ typeLabel() }}</div>
        }
        @if (warnings().length > 0) {
          <div class="warning-messages">
            @for (warning of warnings(); track warning.text) {
              <div>{{ warning.text }}</div>
            }
          </div>
        }
        @if (certificates().length === 0) {
          <div class="certificate-supporting-text">Nenhum certificado emitido</div>
        } @else {
          <div class="certificate-children" role="group" [attr.aria-label]="'Certificados de ' + title()">
            @for (certificate of certificates(); track certificate.id) {
              <mat-checkbox
                [checked]="selectedIds().has(certificate.id)"
                [disabled]="disabled()"
                (change)="selectionChange.emit({ ids: [certificate.id], selected: $event.checked })">
                {{ certificate.config.name }}
              </mat-checkbox>
            }
          </div>
        }
      </div>
    </div>
  `,
  styleUrls: ['../list/attendances-records.css'],
  styles: `
    :host {
      display: block;
    }
    .participation-item.selection-group {
      grid-template-columns: auto auto minmax(0, 1fr);
      padding-inline: 0.25rem 0.75rem;
    }
    .participation-item.selection-group:not(:has(.emoji-frame)) {
      grid-template-columns: auto minmax(0, 1fr);
    }
    .selection-group::after {
      display: none;
    }
    .selection-group:hover {
      background: transparent;
    }
    .certificate-children {
      display: grid;
      margin-top: 0.25rem;
      margin-inline-start: -0.6875rem;
    }
    mat-checkbox {
      max-width: 100%;
      overflow-wrap: anywhere;
    }
  `,
})
export class CertificateSelectionGroup {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly emojiUrl = input('');
  readonly typeLabel = input('');
  readonly warnings = input<readonly { text: string }[]>([]);
  readonly certificates = input.required<Certificate[]>();
  readonly selectedIds = input.required<ReadonlySet<string>>();
  readonly disabled = input(false);
  readonly selectionChange = output<{ ids: string[]; selected: boolean }>();
  readonly certificateIds = computed(() => this.certificates().map(({ id }) => id));
  readonly allSelected = computed(
    () => this.certificateIds().length > 0 && this.certificateIds().every((id) => this.selectedIds().has(id)),
  );
  readonly someSelected = computed(() => this.certificateIds().some((id) => this.selectedIds().has(id)));
}
