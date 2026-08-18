import { FormBuilder } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MergeCandidate, Person } from '@cacic-fct/event-manager-admin-contracts';
import { adminFixtureDate, createAdminPerson } from '../../testing/admin-entity-fixtures';
import { MergeCandidateDialogComponent } from './merge-candidate-dialog.component';

describe('MergeCandidateDialogComponent', () => {
  it('suggests copying only source values missing from the selected target', async () => {
    const { component } = await createFixture();

    expect(component.selectedTargetIndex).toBe(0);
    expect(component.form.getRawValue()).toEqual({
      targetPersonId: 'person-a',
      migrateName: false,
      migrateEmail: false,
      migrateIdentityDocument: true,
      migrateAcademicId: false,
      migrateUserId: true,
      migrateExternalRef: false,
    });
    expect(component.displayValue('  ')).toBe('-');
    expect(component.displayValue(null)).toBe('-');
    expect(component.displayValue(' Ada ')).toBe('Ada');
  });

  it('changes the target tab and recalculates suggested fields', async () => {
    const { component } = await createFixture();

    component.selectTargetIndex(1);

    expect(component.selectedTargetIndex).toBe(1);
    expect(component.form.getRawValue()).toEqual({
      targetPersonId: 'person-b',
      migrateName: false,
      migrateEmail: true,
      migrateIdentityDocument: false,
      migrateAcademicId: true,
      migrateUserId: false,
      migrateExternalRef: true,
    });

    component.selectTargetIndex(0);
    expect(component.selectedTargetIndex).toBe(0);
  });

  it('validates the target and closes with the selected merge fields', async () => {
    const { component, dialogRef } = await createFixture();
    component.form.patchValue({
      migrateName: false,
      migrateEmail: false,
      migrateIdentityDocument: true,
      migrateAcademicId: false,
      migrateUserId: true,
      migrateExternalRef: false,
    });

    component.confirmMerge();

    expect(dialogRef.close).toHaveBeenCalledWith({
      targetPersonId: 'person-a',
      migrateFields: ['IDENTITY_DOCUMENT', 'USER_ID'],
    });

    dialogRef.close.mockClear();
    component.form.controls.targetPersonId.setValue('');
    component.confirmMerge();

    expect(component.form.controls.targetPersonId.touched).toBe(true);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('returns the selected target and fields for the alternate target', async () => {
    const { component, dialogRef } = await createFixture();
    component.selectTargetIndex(1);
    component.form.patchValue({
      migrateName: false,
      migrateEmail: true,
      migrateIdentityDocument: false,
      migrateAcademicId: true,
      migrateUserId: false,
      migrateExternalRef: true,
    });

    component.confirmMerge();

    expect(dialogRef.close).toHaveBeenCalledWith({
      targetPersonId: 'person-b',
      migrateFields: ['EMAIL', 'ACADEMIC_ID', 'EXTERNAL_REF'],
    });
  });
});

async function createFixture(): Promise<{
  component: MergeCandidateDialogComponent;
  dialogRef: { close: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<MergeCandidateDialogComponent>;
}> {
  const dialogRef = { close: vi.fn() };

  await TestBed.configureTestingModule({
    imports: [MergeCandidateDialogComponent],
    providers: [
      FormBuilder,
      provideNoopAnimations(),
      { provide: MAT_DIALOG_DATA, useValue: { candidate: candidateFixture() } },
      { provide: MatDialogRef, useValue: dialogRef },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(MergeCandidateDialogComponent);
  fixture.detectChanges();

  return { component: fixture.componentInstance, dialogRef, fixture };
}

function candidateFixture(): MergeCandidate {
  return {
    id: 'candidate-1',
    personAId: 'person-a',
    personBId: 'person-b',
    pairKey: 'person-a:person-b',
    score: 0.95,
    matchMethod: 'EMAIL',
    matchValue: 'ada@example.edu',
    status: 'PENDING',
    resolvedById: null,
    createdAt: adminFixtureDate,
    updatedAt: adminFixtureDate,
    personA: personFixture({
      id: 'person-a',
      name: 'Ada Lovelace',
      email: 'ada@example.edu',
      identityDocument: null,
      academicId: 'RA-A',
      userId: null,
      externalRef: 'external-a',
    }),
    personB: personFixture({
      id: 'person-b',
      name: 'Ada Byron',
      email: null,
      identityDocument: '22222222222',
      academicId: null,
      userId: 'user-b',
      externalRef: null,
    }),
  } as MergeCandidate;
}

function personFixture(overrides: Partial<Person>): Person {
  return {
    ...createAdminPerson({ id: 'person-1', name: 'Pessoa', email: null }),
    ...overrides,
  } as Person;
}
