import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';
import { PeopleApiService } from '../../../../../graphql/people-api.service';
import { OfflineEventAttendanceSubmission, Person } from '@cacic-fct/event-manager-admin-contracts';
import { OfflineAttendanceSubmissionEditDialogComponent } from './offline-attendance-submission-edit-dialog.component';

describe('OfflineAttendanceSubmissionEditDialogComponent', () => {
  it('shows the original data as read-only context and requires a selected person before saving', async () => {
    const { component, dialogRef } = await createFixture();

    expect(component.originalSourceLabel()).toBe('Entrada manual');
    expect(component.originalValue()).toBe('ada@exmaple.com');
    expect(component.personSearch.value).toBe('ada@exmaple.com');
    component.save();

    expect(component.errorMessage()).toBe('Selecione uma pessoa encontrada para salvar a correção.');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('searches with inferred filters and links a selected person before saving', async () => {
    const { api, component, dialogRef } = await createFixture();
    component.personSearch.setValue('ada@example.com');

    await component.searchPeople();
    component.selectPerson(personFixture);
    component.save();

    expect(api.listPeopleSummaries).toHaveBeenCalledWith({ email: 'ada@example.com', take: 8 });
    expect(api.listPeopleSummaries).toHaveBeenCalledWith({ query: 'ada@example.com', take: 8 });
    expect(dialogRef.close).toHaveBeenCalledWith({
      personId: 'person-1',
    });
  });

  it('uses scanner codes as immutable reference and searches by user id when possible', async () => {
    const { api, component, dialogRef } = await createFixture({
      submission: {
        ...submissionFixture,
        createdByMethod: 'SCANNER',
        scannerCode: 'user:old-code',
        manualValue: null,
      },
    });

    expect(component.originalSourceLabel()).toBe('Código do crachá');
    expect(component.personSearch.value).toBe('user:old-code');
    await component.searchPeople();
    component.selectPerson(personFixture);
    component.save();

    expect(api.listPeopleSummaries).toHaveBeenCalledWith({ userId: 'old-code', take: 8 });
    expect(dialogRef.close).toHaveBeenCalledWith({
      personId: 'person-1',
    });
  });

  it('clears a selected person when the search text changes', async () => {
    const { component } = await createFixture();

    component.selectPerson(personFixture);
    expect(component.selectedPerson()?.id).toBe('person-1');
    component.personSearch.setValue('Grace');

    expect(component.selectedPerson()).toBeNull();
  });
});

async function createFixture({
  submission = submissionFixture,
  people = [personFixture],
}: {
  submission?: OfflineEventAttendanceSubmission & { eventName: string; personName: string };
  people?: Person[];
} = {}): Promise<{
  api: {
    listPeopleSummaries: ReturnType<typeof vi.fn>;
  };
  component: OfflineAttendanceSubmissionEditDialogComponent;
  dialogRef: { close: ReturnType<typeof vi.fn> };
  fixture: ComponentFixture<OfflineAttendanceSubmissionEditDialogComponent>;
}> {
  const api = {
    listPeopleSummaries: vi.fn(() => of(people)),
  };
  const dialogRef = {
    close: vi.fn(),
  };

  await TestBed.configureTestingModule({
    imports: [OfflineAttendanceSubmissionEditDialogComponent],
    providers: [
      provideNoopAnimations(),
      {
        provide: MAT_DIALOG_DATA,
        useValue: {
          submission,
          issueLabel: 'Pessoa não encontrada',
        },
      },
      {
        provide: MatDialogRef,
        useValue: dialogRef,
      },
      {
        provide: PeopleApiService,
        useValue: api,
      },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(OfflineAttendanceSubmissionEditDialogComponent);
  fixture.detectChanges();

  return {
    api,
    component: fixture.componentInstance,
    dialogRef,
    fixture,
  };
}

const personFixture: Person = {
  id: 'person-1',
  name: 'Ada Lovelace',
  email: 'ada@example.edu',
  phone: null,
  identityDocument: '12345678900',
  academicId: '123456',
  createdAt: '2026-05-01T12:00:00.000Z',
  updatedAt: '2026-05-01T12:00:00.000Z',
};

const submissionFixture: OfflineEventAttendanceSubmission & { eventName: string; personName: string } = {
  id: 'offline-attendance-1',
  clientId: 'offline-client-1',
  eventId: 'event-1',
  eventName: 'Credenciamento',
  personId: null,
  person: null,
  personName: 'Pessoa não resolvida',
  status: 'PENDING',
  createdByMethod: 'MANUAL_INPUT',
  scannerCode: null,
  manualValue: 'ada@exmaple.com',
  collectedAt: '2026-05-21T17:20:00.000Z',
  authorUserId: 'collector-user',
  authorName: 'Coletora Offline',
  authorEmail: 'coletora@example.edu',
  submittedById: 'admin-1',
  submittedByFullName: 'Admin Teste',
  submittedAt: '2026-05-21T18:00:00.000Z',
  stagedReason: 'Coleta enviada para revisão administrativa.',
  resolutionError: 'Nenhuma pessoa encontrada para o dado informado.',
  resolutionIssue: 'PERSON_NOT_FOUND',
  collectedLatitude: -22.1211,
  collectedLongitude: -51.4086,
  collectedAccuracyMeters: 12,
};
