import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { SubscriberCsvExportDialogComponent } from './subscriber-csv-export-dialog.component';

describe('SubscriberCsvExportDialogComponent', () => {
  it('rerenders the Aztec preview when the error correction level changes', async () => {
    const fixture = await createFixture();
    const component = fixture.componentInstance;

    component.form.controls.badgeCodes.setValue(true);
    fixture.detectChanges();
    const initialPreview = previewSvg(fixture);

    component.form.controls.badgeErrorCorrectionLevel.setValue('95');
    fixture.detectChanges();

    expect(previewSvg(fixture)).not.toBe(initialPreview);
  });
});

async function createFixture(): Promise<ComponentFixture<SubscriberCsvExportDialogComponent>> {
  await TestBed.configureTestingModule({
    imports: [SubscriberCsvExportDialogComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: MAT_DIALOG_DATA,
        useValue: { title: 'Baixar CSV', recordCount: 1 },
      },
      {
        provide: MatDialogRef,
        useValue: { close: vi.fn() },
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(SubscriberCsvExportDialogComponent);
  fixture.detectChanges();
  return fixture;
}

function previewSvg(fixture: ComponentFixture<SubscriberCsvExportDialogComponent>): string {
  const svg = fixture.nativeElement.querySelector('.badge-preview svg') as SVGElement | null;
  expect(svg).not.toBeNull();
  return svg?.outerHTML ?? '';
}
