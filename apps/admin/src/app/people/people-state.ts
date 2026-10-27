import { DestroyRef, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { createWorkspaceListPagination } from '../pagination/list-pagination';
import { bindLiveSearch } from '../search/live-search';
import { AdminRouteResourceErrorService } from '../shared/admin-route-resource-error.service';
import { PEOPLE_PRESENCE_FILTERS, PeoplePresenceFilter } from './people-search-filters';

export abstract class PeopleState {
  protected readonly api = inject(PeopleApiService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly feedback = inject(AdminFeedbackService);
  protected readonly dialog = inject(MatDialog);
  protected readonly formBuilder = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly destroyRef = inject(DestroyRef);
  protected readonly routeResourceErrors = inject(AdminRouteResourceErrorService);

  readonly people = signal<Person[]>([]);
  readonly peoplePagination = createWorkspaceListPagination();
  readonly selectedPerson = signal<Person | null>(null);
  readonly isCreatingPerson = signal(false);
  readonly peopleSearchQuery = signal('');
  readonly hasExternallyManagedProfile = computed(() => {
    const person = this.selectedPerson();
    return Boolean(person?.userId || person?.user);
  });
  readonly hasLecturerProfile = computed(() => Boolean(this.selectedPerson()?.lecturerProfile));

  readonly personForm = this.formBuilder.nonNullable.group({
    id: [''],
    name: ['', [Validators.required]],
    email: [''],
    secondaryEmails: [''],
    phone: [''],
    identityDocument: [''],
    academicId: [''],
    mergedIntoId: [''],
    externalRef: [''],
  });

  readonly peopleSearchForm = this.formBuilder.nonNullable.group({
    query: [''],
    hasUser: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
    hasLecturerProfile: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
    lecturerSelfEditingBlocked: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
    hasEmail: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
    hasPhone: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
    hasIdentityDocument: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
    hasAcademicId: this.formBuilder.nonNullable.control<PeoplePresenceFilter>('ALL'),
  });

  readonly peoplePresenceFilters = PEOPLE_PRESENCE_FILTERS;
  private readonly peopleSearchValue = toSignal(this.peopleSearchForm.valueChanges, {
    initialValue: this.peopleSearchForm.getRawValue(),
  });
  readonly activePeopleFilterCount = computed(() => {
    const value = this.peopleSearchValue();
    return PEOPLE_PRESENCE_FILTERS.filter(({ key }) => value[key] && value[key] !== 'ALL').length;
  });

  readonly lecturerProfileForm = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required]],
    biography: [''],
    publishGoogleUserPicture: [false],
    selfEditingBlocked: [false],
    email: [''],
    whatsapp: [''],
    linkedin: [''],
  });

  constructor() {
    bindLiveSearch({
      control: this.peopleSearchForm,
      destroyRef: this.destroyRef,
      search: async () => {
        try {
          await this.searchPeople(this.peopleSearchForm.controls.query.value);
        } catch (error) {
          this.feedback.error(error, 'Não foi possível carregar as pessoas.');
        }
      },
    });
  }

  clearPeopleFilters(): void {
    this.peopleSearchForm.patchValue({
      hasUser: 'ALL',
      hasLecturerProfile: 'ALL',
      lecturerSelfEditingBlocked: 'ALL',
      hasEmail: 'ALL',
      hasPhone: 'ALL',
      hasIdentityDocument: 'ALL',
      hasAcademicId: 'ALL',
    });
  }

  abstract searchPeople(query: string): Promise<void>;
}
