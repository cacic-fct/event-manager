import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AttendanceCsvColumnDialogComponent, AttendanceCsvColumnDialogData } from './attendance-csv-column-dialog.component';

describe('AttendanceCsvColumnDialogComponent', () => {
  it('shows preview values from the selected signal form header', async () => {
    const { component } = await createFixture();

    expect(component.previewValues()).toEqual(['ada@example.com', 'grace@example.com']);

    component.form.selectedHeader().value.set('Documento');

    expect(component.previewValues()).toEqual(['123', '456']);
  });

  it('closes with the selected header when confirmed', async () => {
    const { component, dialogRef } = await createFixture();

    component.form.selectedHeader().value.set('Documento');
    component.confirm();

    expect(dialogRef.close).toHaveBeenCalledWith('Documento');
  });
});

async function createFixture(): Promise<{
  component: AttendanceCsvColumnDialogComponent;
  dialogRef: { close: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<AttendanceCsvColumnDialogComponent>;
}> {
  const dialogRef = {
    close: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [AttendanceCsvColumnDialogComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: MAT_DIALOG_DATA,
        useValue: data,
      },
      {
        provide: MatDialogRef,
        useValue: dialogRef,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(AttendanceCsvColumnDialogComponent);

  return {
    component: fixture.componentInstance,
    dialogRef,
    fixture,
  };
}

const data = {
  fileName: 'presencas.csv',
  headers: ['Email', 'Documento'],
  previewRows: [
    { Email: 'ada@example.com', Documento: '123' },
    { Email: ' ', Documento: '' },
    { Email: 'grace@example.com', Documento: '456' },
  ],
} satisfies AttendanceCsvColumnDialogData;
