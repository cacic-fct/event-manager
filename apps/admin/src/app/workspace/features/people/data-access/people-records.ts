import { LecturerProfileInput, Person, PersonInput } from '@cacic-fct/event-manager-admin-contracts';
import { Permission } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import {
  PersonLinkedDataDialogComponent,
  PersonLinkedDataDialogData,
} from '../dialogs/person-linked-data-dialog.component';
import { getErrorMessage } from '../../../../shared/error-message';
import { applyPagedResult, loadNextPage, loadPreviousPage, pageVariables, resetPagination } from '../../../../shared/list-pagination';
import { buildPeopleSearchFilters } from '../../../../shared/people-lookup';
import { PeopleState, type PeoplePermissionSearchFilter } from './people-state';

type PeopleSearchApiFilters = {
  permissionGrantFilter?: 'ACTIVE' | 'ANY';
  hasLecturerProfile?: boolean;
};

export abstract class PeopleRecords extends PeopleState {
  async searchPeople(query: string, options?: { preserveSelection?: boolean }): Promise<void> {
    const normalizedQuery = query.trim();
    if (this.peopleSearchForm.controls.query.value !== query) {
      this.peopleSearchForm.controls.query.setValue(query, { emitEvent: false });
    }
    this.peopleSearchQuery.set(normalizedQuery);
    resetPagination(this.peoplePagination);
    await this.loadPeoplePage(normalizedQuery, options);
  }

  async previousPeoplePage(): Promise<void> {
    await loadPreviousPage(this.peoplePagination, () => this.loadPeoplePage(this.peopleSearchQuery()));
  }

  async nextPeoplePage(): Promise<void> {
    await loadNextPage(this.peoplePagination, () => this.loadPeoplePage(this.peopleSearchQuery()));
  }

  async selectPerson(person: Person): Promise<void> {
    void this.router.navigate(['/people', person.id]);
    if (this.hasPersonDetails(person)) {
      this.populatePersonSelection(person);
      return;
    }

    await this.selectPersonById(person.id);
  }

  async selectPersonById(personId: string): Promise<void> {
    if (this.selectedPerson()?.id === personId) {
      return;
    }

    const person = await firstValueFrom(this.api.getPerson(personId));
    this.populatePersonSelection(person);
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
    this.permissionGrants.set([]);
    this.resetPermissionGrantForm();
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
    this.permissionGrants.set([]);
    this.resetPermissionGrantForm();
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
    };

    try {
      const savedPerson = await firstValueFrom(
        selectedPerson ? this.api.updatePerson(selectedPerson.id, payload) : this.api.createPerson(payload),
      );
      this.snackbar.open(selectedPerson ? 'Pessoa atualizada.' : 'Pessoa criada.', 'Fechar', { duration: 2500 });
      await this.selectPerson(savedPerson);
      await this.searchPeople(this.peopleSearchQuery(), { preserveSelection: true });
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
      biography: raw.biography.trim() || null,
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
      await this.searchPeople(this.peopleSearchQuery(), { preserveSelection: true });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível salvar o perfil de ministrante.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  async openLinkedDataDialog(person: Person): Promise<void> {
    const deleted = await firstValueFrom(
      this.dialog
        .open<PersonLinkedDataDialogComponent, PersonLinkedDataDialogData, boolean>(
          PersonLinkedDataDialogComponent,
          {
            width: 'min(54rem, calc(100vw - 2rem))',
            maxWidth: '100vw',
            data: {
              personId: person.id,
              personName: person.name,
            },
          },
        )
        .afterClosed(),
    );

    if (!deleted) {
      return;
    }

    this.resetPersonForm();
    await this.searchPeople(this.peopleSearchQuery());
  }

  protected updateExternallyManagedControls(): void {
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

    const isCreatingPerson = this.isCreatingPerson();
    if (isCreatingPerson) {
      this.personForm.controls.id.disable({ emitEvent: false });
    } else {
      this.personForm.controls.id.enable({ emitEvent: false });
    }
    this.personForm.controls.mergedIntoId.disable({ emitEvent: false });
    this.personForm.controls.externalRef.disable({ emitEvent: false });
  }

  protected getPersonUserId(person: Person | null): string | null {
    return person?.userId ?? person?.user?.id ?? null;
  }

  protected getSelectedPersonUserId(): string | null {
    return this.getPersonUserId(this.selectedPerson());
  }

  private async loadPeoplePage(normalizedQuery: string, options?: { preserveSelection?: boolean }): Promise<void> {
    const people = await firstValueFrom(
      this.api.listPeopleSummaries(
        buildPeopleSearchFilters(normalizedQuery, {
          ...pageVariables(this.peoplePagination.pageIndex()),
          ...this.buildPeopleSearchApiFilters(),
        }),
      ),
    );
    this.people.set(applyPagedResult(people, this.peoplePagination));

    const selectedPerson = this.selectedPerson();
    if (!selectedPerson || options?.preserveSelection) {
      return;
    }

    const refreshedPerson = people.find((person) => person.id === selectedPerson.id);
    if (refreshedPerson) {
      return;
    }

    this.resetPersonForm();
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
    this.permissionGrants.set([]);
    this.resetPermissionGrantForm();
    void this.loadPermissionGrantsForPerson(person);
    void this.ensurePermissionGrantTargetsLoaded();
    this.updateExternallyManagedControls();
  }

  private hasPersonDetails(person: Person): boolean {
    return (
      'secondaryEmails' in person ||
      'mergedIntoId' in person ||
      'externalRef' in person ||
      'lecturerProfile' in person
    );
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

  private buildPeopleSearchApiFilters(): PeopleSearchApiFilters {
    return {
      ...this.getPermissionGrantApiFilter(this.peopleSearchForm.controls.permissionFilter.value),
      ...(this.peopleSearchForm.controls.hasLecturerProfile.value ? { hasLecturerProfile: true } : {}),
    };
  }

  private getPermissionGrantApiFilter(filter: PeoplePermissionSearchFilter): PeopleSearchApiFilters {
    if (!this.permissions.has(Permission.PermissionGrant.Read)) {
      return {};
    }

    switch (filter) {
      case 'ACTIVE_GRANTS':
        return { permissionGrantFilter: 'ACTIVE' };
      case 'ANY_GRANTS':
        return { permissionGrantFilter: 'ANY' };
      default:
        return {};
    }
  }

  protected abstract resetPermissionGrantForm(options?: { clearDrafts?: boolean }): void;

  protected abstract loadPermissionGrantsForPerson(person: Person): Promise<void>;

  protected abstract ensurePermissionGrantTargetsLoaded(): Promise<void>;
}
