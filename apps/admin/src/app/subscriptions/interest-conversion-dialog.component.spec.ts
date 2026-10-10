import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { InterestConversionDialogComponent } from './interest-conversion-dialog.component';

describe('InterestConversionDialogComponent', () => {
  it('requires an explicit checkbox action before confirming consent', async () => {
    const close = vi.fn();
    await TestBed.configureTestingModule({
      imports: [InterestConversionDialogComponent],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: {
          personName: 'Ana Clara', targetName: 'Oficina', requiresImageLicenseAgreement: true,
        } },
        { provide: MatDialogRef, useValue: { close } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(InterestConversionDialogComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const confirm = element.querySelector<HTMLButtonElement>('button[mat-flat-button]');
    expect(confirm?.disabled).toBe(true);
    fixture.componentInstance.confirm();
    expect(close).not.toHaveBeenCalled();

    element.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    fixture.detectChanges();
    expect(confirm?.disabled).toBe(false);
    confirm?.click();
    expect(close).toHaveBeenCalledWith({ imageLicenseAgreementAccepted: true });
  });
});
