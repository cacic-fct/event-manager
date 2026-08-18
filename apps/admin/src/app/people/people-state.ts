import { DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { AdminFeedbackService } from '../feedback/admin-feedback.service';
import { PeopleApiService } from '../graphql/people-api.service';
import { createWorkspaceListPagination } from '../pagination/list-pagination';
import { bindLiveSearch } from '../search/live-search';

export abstract class PeopleState {
  protected readonly api = inject(PeopleApiService);
  protected readonly snackbar = inject(MatSnackBar);
  protected readonly feedback = inject(AdminFeedbackService);
  protected readonly dialog = inject(MatDialog);
  protected readonly formBuilder = inject(FormBuilder);
  protected readonly router = inject(Router);
  protected readonly destroyRef = inject(DestroyRef);

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
    hasLecturerProfile: [false],
  });

  readonly lecturerProfileForm = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required]],
    biography: [''],
    publishGoogleUserPicture: [false],
    email: [''],
    whatsapp: [''],
  });

  constructor() {
    bindLiveSearch({
      control: this.peopleSearchForm.controls.query,
      destroyRef: this.destroyRef,
      search: (query) => this.searchPeople(query),
    });
    this.peopleSearchForm.controls.hasLecturerProfile.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        void this.searchPeople(this.peopleSearchForm.controls.query.value).catch((error: unknown) =>
          this.feedback.error(error, 'Não foi possível carregar as pessoas.'),
        );
      });
  }

  abstract searchPeople(query: string): Promise<void>;
}
