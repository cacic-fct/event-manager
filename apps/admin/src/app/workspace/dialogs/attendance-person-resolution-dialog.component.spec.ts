import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AttendancePersonResolutionDialogComponent } from './attendance-person-resolution-dialog.component';

describe('AttendancePersonResolutionDialogComponent', () => {
  it('confirms only after every ambiguous value has a selected person', () => {
    const dialogRef = {
      close: vi.fn(),
    };
    const fixture = TestBed.configureTestingModule({
      imports: [AttendancePersonResolutionDialogComponent],
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            ambiguousValues: [
              {
                value: '11999999975',
                candidates: [
                  personFixture({ id: 'document-person', name: 'Ana Documento' }),
                  personFixture({ id: 'phone-person', name: 'Bruno Telefone' }),
                ],
              },
              {
                value: 'ada@example.com',
                candidates: [personFixture({ id: 'email-person', name: 'Ada Email' })],
              },
            ],
          },
        },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).createComponent(AttendancePersonResolutionDialogComponent);
    const component = fixture.componentInstance;

    expect(component.canConfirm()).toBe(false);
    component.selectPerson('11999999975', 'phone-person');
    expect(component.canConfirm()).toBe(false);
    component.selectPerson('ada@example.com', 'email-person');
    expect(component.canConfirm()).toBe(true);

    component.confirm();

    expect(dialogRef.close).toHaveBeenCalledWith([
      { value: '11999999975', personId: 'phone-person' },
      { value: 'ada@example.com', personId: 'email-person' },
    ]);
  });

  it('formats candidate details for registered people', () => {
    const component = Object.create(AttendancePersonResolutionDialogComponent.prototype) as {
      candidateDetails: AttendancePersonResolutionDialogComponent['candidateDetails'];
    };

    expect(component.candidateDetails()).toBe('Pessoa cadastrada');
  });
});

function personFixture(overrides: { id: string; name: string }) {
  return {
    id: overrides.id,
    name: overrides.name,
  };
}
