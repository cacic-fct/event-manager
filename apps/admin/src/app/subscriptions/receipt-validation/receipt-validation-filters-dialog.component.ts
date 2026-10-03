import { Component, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import {
  type ReceiptValidationCategoryFilter,
  type ReceiptValidationFilters,
  type ReceiptValidationSort,
} from './receipt-validation-filtering';

export interface ReceiptValidationFiltersDialogData {
  subscriptionCount: number;
  ticketCount: number;
  paymentTiers: readonly string[];
  filters: ReceiptValidationFilters;
}

@Component({
  selector: 'app-receipt-validation-filters-dialog',
  imports: [MatButtonModule, MatDialogModule, MatFormFieldModule, MatRadioModule, MatSelectModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>Filtrar comprovantes</h2>
    <mat-dialog-content>
      <section aria-labelledby="receipt-category-heading">
        <h3 id="receipt-category-heading">Categoria</h3>
        <mat-radio-group [formControl]="categoryControl" aria-label="Categoria dos comprovantes">
          <mat-radio-button value="ALL">Todas as categorias</mat-radio-button>
          <mat-radio-button value="SUBSCRIPTION">{{ data.subscriptionCount === 1 ? 'Inscrição' : 'Inscrições' }} ({{ data.subscriptionCount }})</mat-radio-button>
          <mat-radio-button value="TICKET">{{ data.ticketCount === 1 ? 'Bilhete' : 'Bilhetes' }} ({{ data.ticketCount }})</mat-radio-button>
        </mat-radio-group>
      </section>

      @if (categoryControl.value === 'SUBSCRIPTION' && data.paymentTiers.length > 1) {
        <mat-form-field appearance="outline">
          <mat-label>Lote da inscrição</mat-label>
          <mat-select [formControl]="paymentTierControl">
            <mat-option [value]="null">Todos os lotes</mat-option>
            @for (tier of data.paymentTiers; track tier) {
              <mat-option [value]="tier">{{ tier }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <mat-form-field appearance="outline">
        <mat-label>Ordenar por</mat-label>
        <mat-select [formControl]="sortControl">
          <mat-option value="UPDATED_ASC">Última alteração (mais antiga primeiro)</mat-option>
          <mat-option value="UPDATED_DESC">Última alteração (mais recente primeiro)</mat-option>
          <mat-option value="CREATED_ASC">Criação (mais antiga primeiro)</mat-option>
          <mat-option value="CREATED_DESC">Criação (mais recente primeiro)</mat-option>
        </mat-select>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="button" [mat-dialog-close]="result()">Aplicar filtros</button>
    </mat-dialog-actions>
  `,
  styles: `
    mat-dialog-content { display: grid; gap: 1rem; }
    section { display: grid; gap: 0.5rem; }
    h3 { margin: 0; font: var(--mat-sys-title-small); }
    mat-radio-group { display: grid; gap: 0.25rem; }
    mat-form-field { width: 100%; }
  `,
})
export class ReceiptValidationFiltersDialogComponent {
  protected readonly data = inject<ReceiptValidationFiltersDialogData>(MAT_DIALOG_DATA);
  protected readonly categoryControl = new FormControl<ReceiptValidationCategoryFilter>(this.data.filters.category, {
    nonNullable: true,
  });
  protected readonly paymentTierControl = new FormControl<string | null>(this.data.filters.paymentTier);
  protected readonly sortControl = new FormControl<ReceiptValidationSort>(this.data.filters.sort, { nonNullable: true });

  protected result(): ReceiptValidationFilters {
    const category = this.categoryControl.value;
    return {
      category,
      paymentTier: category === 'SUBSCRIPTION' ? this.paymentTierControl.value : null,
      sort: this.sortControl.value,
    };
  }
}
