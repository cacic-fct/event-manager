import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of } from 'rxjs';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { PeopleService } from './people.service';

describe('PeopleService after permission management extraction', () => {
  const person = {
    id: 'person-1',
    name: 'Ana Souza',
    email: 'ana@example.com',
    secondaryEmails: [],
    phone: null,
    identityDocument: null,
    academicId: null,
    userId: null,
    createdAt: '2026-08-17T12:00:00.000Z',
    updatedAt: '2026-08-17T12:00:00.000Z',
    lecturerProfile: null,
  };
  const api = {
    listPeopleSummaries: vi.fn().mockReturnValue(of([person])),
    getPerson: vi.fn().mockReturnValue(of(person)),
    updatePerson: vi.fn().mockReturnValue(of(person)),
    createPerson: vi.fn().mockReturnValue(of(person)),
    upsertLecturerProfile: vi.fn(),
  };
  let service: PeopleService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PeopleService,
        provideRouter([]),
        { provide: PeopleApiService, useValue: api },
        { provide: MatSnackBar, useValue: { open: vi.fn() } },
        { provide: MatDialog, useValue: { open: vi.fn() } },
        { provide: AdminFeedbackService, useValue: { error: vi.fn() } },
      ],
    });
    service = TestBed.inject(PeopleService);
  });

  it('searches people without legacy permission-grant filters', async () => {
    await service.searchPeople('Ana');
    expect(service.people()).toEqual([person]);
    expect(api.listPeopleSummaries).toHaveBeenCalledWith(expect.objectContaining({ query: 'Ana' }));
    expect(service.peopleSearchForm.controls).not.toHaveProperty('permissionFilter');
  });

  it('selects people independently from account linkage', async () => {
    await service.selectPersonById('person-1');
    expect(service.selectedPerson()?.id).toBe('person-1');
    expect(service.hasExternallyManagedProfile()).toBe(false);
  });
});
