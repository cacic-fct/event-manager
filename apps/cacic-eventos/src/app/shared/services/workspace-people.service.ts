import { Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { PeopleApiService } from '../../graphql/people-api.service';
import { Person, PersonInput } from '../../graphql/models';

@Injectable({
  providedIn: 'root',
})
export class WorkspacePeopleService {
  private readonly api = inject(PeopleApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);

  readonly people = signal<Person[]>([]);
  readonly selectedPerson = signal<Person | null>(null);
  readonly isCreatingPerson = signal(false);
  readonly peopleSearchQuery = signal('');

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

  async searchPeople(query: string): Promise<void> {
    const normalizedQuery = query.trim();
    this.peopleSearchQuery.set(normalizedQuery);
    const people = await firstValueFrom(
      this.api.listPeople({
        query: normalizedQuery || undefined,
        take: 50,
      }),
    );
    this.people.set(people);

    const selectedPerson = this.selectedPerson();
    if (!selectedPerson) {
      return;
    }

    const refreshedPerson = people.find(
      (person) => person.id === selectedPerson.id,
    );
    if (refreshedPerson) {
      this.selectPerson(refreshedPerson);
      return;
    }

    this.resetPersonForm();
  }

  selectPerson(person: Person): void {
    this.isCreatingPerson.set(false);
    this.selectedPerson.set(person);
    this.personForm.reset({
      id: person.id,
      name: person.name,
      email: person.email ?? '',
      secondaryEmails: person.secondaryEmails?.join(', ') ?? '',
      phone: person.phone ?? '',
      identityDocument: person.identityDocument ?? '',
      academicId: person.academicId ?? '',
      mergedIntoId: person.mergedIntoId ?? '',
      externalRef: person.externalRef ?? '',
    });
  }

  resetPersonForm(): void {
    this.isCreatingPerson.set(false);
    this.selectedPerson.set(null);
    this.personForm.reset({
      id: '',
      name: '',
      email: '',
      secondaryEmails: '',
      phone: '',
      identityDocument: '',
      academicId: '',
      mergedIntoId: '',
      externalRef: '',
    });
  }

  startNewPerson(): void {
    this.selectedPerson.set(null);
    this.isCreatingPerson.set(true);
    this.personForm.reset({
      id: '',
      name: '',
      email: '',
      secondaryEmails: '',
      phone: '',
      identityDocument: '',
      academicId: '',
      mergedIntoId: '',
      externalRef: '',
    });
  }

  async savePerson(): Promise<void> {
    const selectedPerson = this.selectedPerson();
    if (!selectedPerson && !this.isCreatingPerson()) {
      return;
    }

    if (this.personForm.invalid) {
      this.personForm.markAllAsTouched();
      return;
    }

    const raw = this.personForm.getRawValue();
    const payload: PersonInput = {
      name: raw.name.trim(),
      email: raw.email.trim() || null,
      secondaryEmails: raw.secondaryEmails
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0),
      phone: raw.phone.trim() || null,
      identityDocument: raw.identityDocument.trim() || null,
      academicId: raw.academicId.trim() || null,
      mergedIntoId: raw.mergedIntoId.trim() || null,
      externalRef: raw.externalRef.trim() || null,
    };

    const savedPerson = await firstValueFrom(
      selectedPerson
        ? this.api.updatePerson(selectedPerson.id, payload)
        : this.api.createPerson(payload),
    );
    this.snackbar.open(
      selectedPerson ? 'Pessoa atualizada.' : 'Pessoa criada.',
      'Fechar',
      { duration: 2500 },
    );
    this.selectPerson(savedPerson);
    await this.searchPeople(this.peopleSearchQuery());
  }
}
