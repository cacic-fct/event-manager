import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import type { MajorEventPriceTier } from '@cacic-fct/event-manager-admin-contracts';
import {
  SubscriptionCsvColumnDialogComponent,
  type SubscriptionCsvColumnDialogData,
} from './subscription-csv-column-dialog.component';

describe('SubscriptionCsvColumnDialogComponent', () => {
  it('requires a tier when import rules are active and returns the chosen tier', async () => {
    const tier: MajorEventPriceTier = {
      id: 'tier-1',
      name: 'Estudante',
      value: 0,
      includesSportsRegistration: false,
      customizeSubscriptionLimits: true,
      maxCoursesPerAttendee: 0,
    };
    const data: SubscriptionCsvColumnDialogData = {
      fileName: 'inscricoes.csv',
      headers: ['e-mail', 'eventos'],
      previewRows: [],
      paymentTiers: [tier],
      paymentTierRequired: true,
    };
    const dialogRef = { close: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [SubscriptionCsvColumnDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(SubscriptionCsvColumnDialogComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.canConfirm()).toBe(false);
    component.form.patchValue({
      paymentTier: tier.name,
      'e-mail': 'emailHeader',
      eventos: 'subscribedEventIdsHeader',
    } as never);
    fixture.detectChanges();
    expect(component.form.getRawValue()).toMatchObject({
      paymentTier: tier.name,
      'e-mail': 'emailHeader',
      eventos: 'subscribedEventIdsHeader',
    });
    expect(component.form.valid).toBe(true);
    expect(component.canConfirm()).toBe(true);

    component.confirm();

    expect(dialogRef.close).toHaveBeenCalledWith({
      columnMapping: {
        emailHeader: 'e-mail',
        fullNameHeader: null,
        enrollmentNumberHeader: null,
        identityDocumentHeader: null,
        subscribedEventIdsHeader: 'eventos',
      },
      subscriptionStatus: 'CONFIRMED',
      paymentTier: tier.name,
    });
  });
});
