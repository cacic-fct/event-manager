import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { PlacePreset, PlacePresetInput } from '../../graphql/models';

export type PlacePresetMergeDialogResult = {
  targetId: string;
  sourceId: string;
  place: PlacePresetInput;
};

type PlaceMergeControlName = 'useName' | 'useLatitude' | 'useLongitude' | 'useLocationDescription';

type PlaceMergeField = {
  controlName: PlaceMergeControlName;
  label: string;
  valueAccessor: (place: PlacePreset) => string | number | null | undefined;
};

type PlacePresetMergeDialogData = {
  target: PlacePreset;
  source: PlacePreset;
};

const FIELD_OPTIONS: PlaceMergeField[] = [
  {
    controlName: 'useName',
    label: 'Nome',
    valueAccessor: (place) => place.name,
  },
  {
    controlName: 'useLatitude',
    label: 'Latitude',
    valueAccessor: (place) => place.latitude,
  },
  {
    controlName: 'useLongitude',
    label: 'Longitude',
    valueAccessor: (place) => place.longitude,
  },
  {
    controlName: 'useLocationDescription',
    label: 'Nome e descrição exibidos aos usuários',
    valueAccessor: (place) => place.locationDescription,
  },
];

@Component({
  selector: 'app-place-preset-merge-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, ReactiveFormsModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatTabsModule],
  template: `
    <h2 mat-dialog-title>Unificar locais duplicados</h2>
    <div mat-dialog-content [formGroup]="form" class="content">
      <p class="note">
        Escolha qual cadastro permanece. Os eventos existentes continuam com os dados de local já gravados.
      </p>

      <mat-tab-group
        animationDuration="160ms"
        mat-stretch-tabs="false"
        [selectedIndex]="selectedTargetIndex"
        (selectedIndexChange)="selectTargetIndex($event)">
        <mat-tab>
          <ng-template mat-tab-label>Manter {{ target.name }}</ng-template>
          <ng-template
            [ngTemplateOutlet]="mergePreview"
            [ngTemplateOutletContext]="{ kept: target, removed: source }" />
        </mat-tab>
        <mat-tab>
          <ng-template mat-tab-label>Manter {{ source.name }}</ng-template>
          <ng-template
            [ngTemplateOutlet]="mergePreview"
            [ngTemplateOutletContext]="{ kept: source, removed: target }" />
        </mat-tab>
      </mat-tab-group>

      <ng-template #mergePreview let-kept="kept" let-removed="removed">
        <section class="merge-summary">
          <div class="place-panel kept">
            <span>Será mantido</span>
            <strong>{{ kept.name }}</strong>
            <small>{{ kept.id }}</small>
          </div>
          <div class="place-panel removed">
            <span>Será removido</span>
            <strong>{{ removed.name }}</strong>
            <small>{{ removed.id }}</small>
          </div>
        </section>

        <section class="field-grid">
          @for (field of fieldOptions; track field.controlName) {
            <div class="field-row" [class.selected-field-row]="isFieldSelected(field)">
              <mat-checkbox [formControlName]="field.controlName" />
              <span class="field-name">{{ field.label }}</span>
              <span>{{ displayValue(field.valueAccessor(kept)) }}</span>
              <span>{{ displayValue(field.valueAccessor(removed)) }}</span>
              <span>
                @if (isFieldSelected(field)) {
                  Usar removido
                } @else {
                  Manter atual
                }
              </span>
            </div>
          }
        </section>
      </ng-template>
    </div>
    <div mat-dialog-actions>
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button type="button" (click)="confirmMerge()" [disabled]="form.invalid">Unificar</button>
    </div>
  `,
  styles: [
    `
      .content {
        display: grid;
        gap: 1rem;
        min-width: min(50rem, calc(100vw - 3rem));
      }

      .note {
        margin: 0;
        color: var(--mat-sys-on-surface-variant);
      }

      .merge-summary {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.75rem;
        padding: 1rem 0;
      }

      .place-panel {
        display: grid;
        gap: 0.25rem;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 0.875rem;
      }

      .place-panel strong,
      .place-panel small {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .kept {
        background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
      }

      .removed {
        background: color-mix(in srgb, var(--mat-sys-error-container) 32%, transparent);
      }

      .field-grid {
        display: grid;
        gap: 0.375rem;
      }

      .field-row {
        display: grid;
        grid-template-columns: auto minmax(8rem, 0.8fr) repeat(3, minmax(8rem, 1fr));
        gap: 0.75rem;
        align-items: center;
        border: 1px solid var(--mat-sys-outline-variant);
        border-radius: 8px;
        padding: 0.625rem 0.875rem;
      }

      .field-row span {
        min-width: 0;
        overflow-wrap: anywhere;
      }

      .field-name {
        font-weight: 500;
      }

      .selected-field-row {
        background: color-mix(in srgb, var(--mat-sys-primary) 7%, transparent);
      }

      @media (max-width: 760px) {
        .content {
          min-width: 0;
        }

        .merge-summary {
          grid-template-columns: 1fr;
        }

        .field-row {
          grid-template-columns: auto 1fr;
        }

        .field-row span:not(.field-name) {
          grid-column: 2;
        }
      }
    `,
  ],
})
export class PlacePresetMergeDialogComponent {
  private readonly data = inject<PlacePresetMergeDialogData>(MAT_DIALOG_DATA);
  private readonly formBuilder = inject(FormBuilder);
  private readonly dialogRef = inject(
    MatDialogRef<PlacePresetMergeDialogComponent, PlacePresetMergeDialogResult | null>,
  );

  readonly target = this.data.target;
  readonly source = this.data.source;
  readonly fieldOptions = FIELD_OPTIONS;
  readonly form = this.formBuilder.nonNullable.group({
    targetId: [this.target.id, [Validators.required]],
    useName: [false],
    useLatitude: [false],
    useLongitude: [false],
    useLocationDescription: [false],
  });

  constructor() {
    this.applySuggestedFieldSelection();
    this.form.controls.targetId.valueChanges.subscribe(() => this.applySuggestedFieldSelection());
  }

  get selectedTargetIndex(): number {
    return this.form.controls.targetId.value === this.source.id ? 1 : 0;
  }

  selectTargetIndex(index: number): void {
    this.form.controls.targetId.setValue(index === 1 ? this.source.id : this.target.id);
  }

  confirmMerge(): void {
    const kept = this.getKeptPlace();
    const removed = this.getRemovedPlace();
    this.dialogRef.close({
      targetId: kept.id,
      sourceId: removed.id,
      place: {
        name: this.form.controls.useName.value ? removed.name : kept.name,
        latitude: this.form.controls.useLatitude.value ? (removed.latitude ?? null) : (kept.latitude ?? null),
        longitude: this.form.controls.useLongitude.value ? (removed.longitude ?? null) : (kept.longitude ?? null),
        locationDescription: this.form.controls.useLocationDescription.value
          ? (removed.locationDescription ?? null)
          : (kept.locationDescription ?? null),
      },
    });
  }

  displayValue(value: string | number | null | undefined): string {
    return value == null || value === '' ? '-' : value.toString();
  }

  isFieldSelected(field: PlaceMergeField): boolean {
    return this.form.controls[field.controlName].value;
  }

  private getKeptPlace(): PlacePreset {
    return this.form.controls.targetId.value === this.target.id ? this.target : this.source;
  }

  private getRemovedPlace(): PlacePreset {
    return this.form.controls.targetId.value === this.target.id ? this.source : this.target;
  }

  private applySuggestedFieldSelection(): void {
    const kept = this.getKeptPlace();
    const removed = this.getRemovedPlace();
    for (const field of this.fieldOptions) {
      const keptValue = field.valueAccessor(kept);
      const removedValue = field.valueAccessor(removed);
      this.form.controls[field.controlName].setValue((keptValue == null || keptValue === '') && removedValue != null, {
        emitEvent: false,
      });
    }
  }
}
