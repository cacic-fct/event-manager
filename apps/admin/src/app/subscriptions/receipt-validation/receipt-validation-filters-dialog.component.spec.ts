import { TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { FormControl } from '@angular/forms';
import {
  DEFAULT_RECEIPT_VALIDATION_FILTERS,
  type ReceiptValidationFilters,
} from './receipt-validation-filtering';
import {
  ReceiptValidationFiltersDialogComponent,
  type ReceiptValidationFiltersDialogData,
} from './receipt-validation-filters-dialog.component';

function setup(filters: ReceiptValidationFilters = DEFAULT_RECEIPT_VALIDATION_FILTERS) {
  const close = vi.fn();
  const data: ReceiptValidationFiltersDialogData = {
    subscriptionCount: 3,
    ticketCount: 2,
    paymentTiers: ['Estudante', 'Visitante'],
    filters,
  };
  TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, ReceiptValidationFiltersDialogComponent],
    providers: [
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: { close } },
    ],
  });
  const fixture = TestBed.createComponent(ReceiptValidationFiltersDialogComponent);
  fixture.detectChanges();
  return { fixture, close };
}

describe('ReceiptValidationFiltersDialogComponent', () => {
  it('shows category counts and subscription tiers, then returns the selected sort', async () => {
    const { fixture, close } = setup();
    const radios = [...fixture.nativeElement.querySelectorAll('mat-radio-button')] as HTMLElement[];
    expect(radios.map((radio) => radio.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringContaining('Todas as categorias'),
      expect.stringContaining('Inscrições (3)'),
      expect.stringContaining('Bilhetes (2)'),
    ]);
    radios.find((radio) => radio.textContent?.includes('Bilhetes'))?.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Lote da inscrição');

    [...fixture.nativeElement.querySelectorAll('mat-radio-button')]
      .find((radio: HTMLElement) => radio.textContent?.includes('Inscrições'))
      ?.click();
    const controls = fixture.componentInstance as unknown as {
      categoryControl: FormControl<'ALL' | 'SUBSCRIPTION' | 'TICKET'>;
      paymentTierControl: FormControl<string | null>;
      sortControl: FormControl<'UPDATED_ASC' | 'UPDATED_DESC' | 'CREATED_ASC' | 'CREATED_DESC'>;
    };
    controls.categoryControl.setValue('SUBSCRIPTION');
    fixture.detectChanges();
    const selects = [...fixture.nativeElement.querySelectorAll('mat-select')] as HTMLElement[];
    expect(selects).toHaveLength(2);
    controls.paymentTierControl.setValue('Visitante');
    controls.sortControl.setValue('CREATED_DESC');
    fixture.detectChanges();

    const apply = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
      button.textContent?.includes('Aplicar filtros'),
    ) as HTMLButtonElement;
    apply.click();
    expect(close).toHaveBeenCalledWith({ category: 'SUBSCRIPTION', paymentTier: 'Visitante', sort: 'CREATED_DESC' });
  });

  it('preserves current filters when canceled', () => {
    const current: ReceiptValidationFilters = { category: 'TICKET', paymentTier: null, sort: 'UPDATED_DESC' };
    const { fixture, close } = setup(current);
    const cancel = [...fixture.nativeElement.querySelectorAll('button')].find((button: HTMLButtonElement) =>
      button.textContent?.includes('Cancelar'),
    ) as HTMLButtonElement;
    cancel.click();
    expect(close).toHaveBeenCalledWith('');
  });
});
