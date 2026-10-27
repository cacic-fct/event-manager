import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, Subject } from 'rxjs';
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
    vi.clearAllMocks();
    api.listPeopleSummaries.mockReturnValue(of([person]));
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

  it('saves the editing lock and resets it when selecting another person', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    service.selectedPerson.set(person);
    service.lecturerProfileForm.patchValue({ displayName: 'Ana Souza', selfEditingBlocked: true });
    api.upsertLecturerProfile.mockReturnValueOnce(
      of({
        id: 'profile-1',
        personId: person.id,
        displayName: 'Ana Souza',
        selfEditingBlocked: true,
      }),
    );
    await service.saveLecturerProfile();
    expect(api.upsertLecturerProfile).toHaveBeenCalledWith(
      person.id,
      expect.objectContaining({ selfEditingBlocked: true }),
    );
    expect(service.selectedPerson()?.lecturerProfile?.selfEditingBlocked).toBe(true);
    await service.selectPerson(person);
    expect(service.lecturerProfileForm.controls.selfEditingBlocked.value).toBe(false);
  });

  it('searches people without legacy permission-grant filters', async () => {
    await service.searchPeople('Ana');
    expect(service.people()).toEqual([person]);
    expect(api.listPeopleSummaries).toHaveBeenCalledWith(expect.objectContaining({ query: 'Ana' }));
    expect(service.peopleSearchForm.controls).not.toHaveProperty('permissionFilter');
  });

  it('combines presence filters with the text query before pagination', async () => {
    service.peopleSearchForm.patchValue(
      {
        hasUser: 'YES',
        hasLecturerProfile: 'NO',
        hasEmail: 'NO',
        hasPhone: 'YES',
        hasIdentityDocument: 'NO',
        hasAcademicId: 'YES',
      },
      { emitEvent: false },
    );
    service.peoplePagination.pageIndex.set(3);
    await service.searchPeople(' Ana ');
    expect(api.listPeopleSummaries).toHaveBeenLastCalledWith({
      query: 'Ana',
      skip: 0,
      take: 51,
      hasUser: true,
      hasLecturerProfile: false,
      hasEmail: false,
      hasPhone: true,
      hasIdentityDocument: false,
      hasAcademicId: true,
    });
    expect(service.peoplePagination.pageIndex()).toBe(0);
    service.peoplePagination.hasNextPage.set(true);
    await service.nextPeoplePage();
    expect(api.listPeopleSummaries).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: 50,
        hasUser: true,
        hasLecturerProfile: false,
        hasEmail: false,
      }),
    );
  });

  it('searches when filters change and clears filters while preserving the query', async () => {
    vi.useFakeTimers();
    try {
      service.peopleSearchForm.patchValue({
        query: 'Ana',
        hasLecturerProfile: 'NO',
        hasPhone: 'NO',
        lecturerSelfEditingBlocked: 'YES',
      });
      expect(service.activePeopleFilterCount()).toBe(3);
      await vi.advanceTimersByTimeAsync(250);
      expect(api.listPeopleSummaries).toHaveBeenLastCalledWith(
        expect.objectContaining({
          query: 'Ana',
          hasLecturerProfile: false,
          hasPhone: false,
          lecturerSelfEditingBlocked: true,
        }),
      );
      service.clearPeopleFilters();
      expect(service.activePeopleFilterCount()).toBe(0);
      expect(service.peopleSearchForm.controls.query.value).toBe('Ana');
      await vi.advanceTimersByTimeAsync(250);
      expect(api.listPeopleSummaries).toHaveBeenLastCalledWith({ query: 'Ana', skip: 0, take: 51 });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['YES', 'NO'] as const)('keeps the editing lock filter %s when paging', async (value) => {
    service.peopleSearchForm.controls.lecturerSelfEditingBlocked.setValue(value, { emitEvent: false });
    await service.searchPeople('Ana');
    service.peoplePagination.hasNextPage.set(true);
    await service.nextPeoplePage();
    expect(api.listPeopleSummaries).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skip: 50,
        lecturerSelfEditingBlocked: value === 'YES',
      }),
    );
  });

  it('ignores a stale response after the filters change', async () => {
    const stale = new Subject<(typeof person)[]>();
    api.listPeopleSummaries.mockReturnValueOnce(stale);
    const oldSearch = service.searchPeople('Ana');
    service.peopleSearchForm.controls.hasPhone.setValue('NO', { emitEvent: false });
    api.listPeopleSummaries.mockReturnValueOnce(of([]));
    await service.searchPeople('Ana');
    stale.next([person]);
    await oldSearch;
    expect(service.people()).toEqual([]);
    expect(service.peoplePagination.hasNextPage()).toBe(false);
  });

  it('selects people independently from account linkage', async () => {
    await service.selectPersonById('person-1');
    expect(service.selectedPerson()?.id).toBe('person-1');
    expect(service.hasExternallyManagedProfile()).toBe(false);
  });
});
