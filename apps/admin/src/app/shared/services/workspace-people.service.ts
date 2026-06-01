import { computed, Injectable, inject, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { PeopleApiService } from '../../graphql/people-api.service';
import { LecturerProfileInput, Person, PersonInput } from '../../graphql/models';
import { getErrorMessage } from '../error-message';

@Injectable({
  providedIn: 'root',
})
export class WorkspacePeopleService {
  private readonly api = inject(PeopleApiService);
  private readonly snackbar = inject(MatSnackBar);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly people = signal<Person[]>([]);
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

  readonly lecturerProfileForm = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required]],
    biography: ['', [Validators.required]],
    publishGoogleUserPicture: [false],
    email: [''],
    whatsapp: [''],
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

    const refreshedPerson = people.find((person) => person.id === selectedPerson.id);
    if (refreshedPerson) {
      void this.selectPerson(refreshedPerson);
      return;
    }

    this.resetPersonForm();
  }

  async selectPerson(person: Person): Promise<void> {
    void this.router.navigate(['/people', person.id]);
    this.populatePersonSelection(person);
  }

  async selectPersonById(personId: string): Promise<void> {
    if (this.selectedPerson()?.id === personId) {
      return;
    }

    const person = await firstValueFrom(this.api.getPerson(personId));
    this.populatePersonSelection(person);
  }

  private populatePersonSelection(person: Person): void {
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
    this.populateLecturerProfileForm(person);
    this.updateExternallyManagedControls();
  }

  resetPersonForm(): void {
    void this.router.navigate(['/people']);
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
    this.resetLecturerProfileForm();
    this.updateExternallyManagedControls();
  }

  startNewPerson(): void {
    void this.router.navigate(['/people']);
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
    this.resetLecturerProfileForm();
    this.updateExternallyManagedControls();
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

    try {
      const savedPerson = await firstValueFrom(
        selectedPerson ? this.api.updatePerson(selectedPerson.id, payload) : this.api.createPerson(payload),
      );
      this.snackbar.open(selectedPerson ? 'Pessoa atualizada.' : 'Pessoa criada.', 'Fechar', { duration: 2500 });
      await this.selectPerson(savedPerson);
      await this.searchPeople(this.peopleSearchQuery());
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar a pessoa.'), 'Fechar', { duration: 5000 });
    }
  }

  async saveLecturerProfile(): Promise<void> {
    const selectedPerson = this.selectedPerson();
    if (!selectedPerson) {
      return;
    }

    if (this.lecturerProfileForm.invalid) {
      this.lecturerProfileForm.markAllAsTouched();
      return;
    }

    const raw = this.lecturerProfileForm.getRawValue();
    const wasExistingProfile = this.hasLecturerProfile();
    const payload: LecturerProfileInput = {
      displayName: raw.displayName.trim(),
      biography: raw.biography.trim(),
      publishGoogleUserPicture: raw.publishGoogleUserPicture,
      email: raw.email.trim() || null,
      whatsapp: this.normalizeWhatsapp(raw.whatsapp.trim()),
    };

    try {
      const lecturerProfile = await firstValueFrom(this.api.upsertLecturerProfile(selectedPerson.id, payload));
      this.selectedPerson.set({
        ...selectedPerson,
        lecturerProfile,
      });
      this.snackbar.open(
        wasExistingProfile ? 'Perfil de ministrante atualizado.' : 'Perfil de ministrante criado.',
        'Fechar',
        {
          duration: 2500,
        },
      );
      await this.searchPeople(this.peopleSearchQuery());
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar o perfil de ministrante.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  private updateExternallyManagedControls(): void {
    const controls = [
      this.personForm.controls.name,
      this.personForm.controls.email,
      this.personForm.controls.phone,
      this.personForm.controls.identityDocument,
      this.personForm.controls.academicId,
    ];

    for (const control of controls) {
      if (this.hasExternallyManagedProfile()) {
        control.disable({ emitEvent: false });
      } else {
        control.enable({ emitEvent: false });
      }
    }
  }

  private populateLecturerProfileForm(person: Person): void {
    this.lecturerProfileForm.reset({
      displayName: person.lecturerProfile?.displayName ?? '',
      biography: person.lecturerProfile?.biography ?? '',
      publishGoogleUserPicture: person.lecturerProfile?.publishGoogleUserPicture ?? false,
      email: person.lecturerProfile?.email ?? '',
      whatsapp: person.lecturerProfile?.whatsapp ?? '',
    });
  }

  private resetLecturerProfileForm(): void {
    this.lecturerProfileForm.reset({
      displayName: '',
      biography: '',
      publishGoogleUserPicture: false,
      email: '',
      whatsapp: '',
    });
  }

  private normalizeWhatsapp(value: string): string | null {
    if (!value) {
      return null;
    }

    const hasPlus = value.startsWith('+');
    const digits = value.replace(/\D/g, '');
    const normalized = hasPlus ? `+${digits}` : digits.length === 10 || digits.length === 11 ? `+55${digits}` : `+${digits}`;

    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : value;
  }
}
