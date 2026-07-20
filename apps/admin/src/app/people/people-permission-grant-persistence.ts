import { EventManagerPermissionGrant, EventManagerPermissionGrantInput, Person } from '@cacic-fct/event-manager-admin-contracts';
import { EventManagerPermissionGrantScope } from '@cacic-fct/shared-permissions';
import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../feedback/error-message';
import {
  buildPermissionGrantInputFromDraft,
  buildPermissionGrantUpdateInput,
  findPermissionGrantBatchConflict,
  sortPermissionGrants,
} from './people-permission-grants';
import { PeoplePermissionGrantEditor } from './people-permission-grant-editor';

export abstract class PeoplePermissionGrantPersistence extends PeoplePermissionGrantEditor {
  async savePermissionGrantDrafts(): Promise<void> {
    const selectedPerson = this.selectedPerson();
    if (!selectedPerson) {
      return;
    }

    const drafts = this.permissionGrantDrafts();
    if (drafts.length === 0) {
      this.snackbar.open('Adicione permissões à revisão antes de salvar.', 'Fechar', { duration: 3000 });
      return;
    }

    await this.createPermissionGrantBatch(
      selectedPerson,
      drafts.map((draft) => buildPermissionGrantInputFromDraft(draft)),
      {
        success: drafts.length === 1 ? 'Permissão concedida.' : 'Permissões concedidas.',
        failure: 'Não foi possível conceder as permissões.',
      },
    );
  }

  async updatePermissionGrant(): Promise<void> {
    const editingGrant = this.editingPermissionGrant();
    if (!editingGrant) {
      return;
    }

    if (this.permissionGrantForm.invalid) {
      this.permissionGrantForm.markAllAsTouched();
      return;
    }

    const raw = this.permissionGrantForm.getRawValue();
    const targetId = raw.targetId.trim();
    if (raw.scope !== EventManagerPermissionGrantScope.Global && !targetId) {
      this.permissionGrantForm.controls.targetId.markAsTouched();
      this.snackbar.open('Selecione o alvo do escopo.', 'Fechar', { duration: 3000 });
      return;
    }

    const validity = this.normalizePermissionGrantValidity(raw.validFrom, raw.validUntil);
    if (!validity) {
      return;
    }

    const input = buildPermissionGrantUpdateInput(raw.permission, raw.scope, targetId, validity);

    try {
      const updatedGrant = await firstValueFrom(this.permissionGrantsApi.updateGrant(editingGrant.id, input));
      this.permissionGrants.update((grants) =>
        sortPermissionGrants(grants.map((grant) => (grant.id === updatedGrant.id ? updatedGrant : grant))),
      );
      this.resetPermissionGrantForm({ clearDrafts: false });
      this.snackbar.open('Permissão atualizada.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível atualizar a permissão.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  async deletePermissionGrant(grant: EventManagerPermissionGrant): Promise<void> {
    try {
      await firstValueFrom(this.permissionGrantsApi.deleteGrant(grant.id));
      this.permissionGrants.update((grants) => grants.filter((item) => item.id !== grant.id));
      this.snackbar.open('Permissão removida.', 'Fechar', { duration: 2500 });
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível remover a permissão.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  protected async loadPermissionGrantsForPerson(person: Person): Promise<void> {
    const userId = this.getPersonUserId(person);
    if (!userId) {
      if (this.selectedPerson()?.id === person.id) {
        this.permissionGrants.set([]);
      }
      return;
    }

    try {
      const grants = await firstValueFrom(this.permissionGrantsApi.listUserGrants(userId));
      if (this.selectedPerson()?.id === person.id && this.getSelectedPersonUserId() === userId) {
        this.permissionGrants.set(sortPermissionGrants(grants));
      }
    } catch (error) {
      if (this.selectedPerson()?.id !== person.id) {
        return;
      }
      this.permissionGrants.set([]);
      this.snackbar.open(getErrorMessage(error, 'Não foi possível carregar as permissões.'), 'Fechar', {
        duration: 5000,
      });
    }
  }

  protected async ensurePermissionGrantTargetsLoaded(): Promise<void> {
    if (this.permissionGrantTargetsLoaded) {
      return;
    }

    if (this.permissionGrantTargetsLoading) {
      await this.permissionGrantTargetsLoading;
      return;
    }

    this.permissionGrantTargetsLoading = this.loadPermissionGrantTargets();
    try {
      const loaded = await this.permissionGrantTargetsLoading;
      if (loaded) {
        this.permissionGrantTargetsLoaded = true;
      }
    } finally {
      this.permissionGrantTargetsLoading = null;
    }
  }

  private async createPermissionGrantBatch(
    selectedPerson: Person,
    inputs: EventManagerPermissionGrantInput[],
    messages: { success: string; failure: string },
  ): Promise<void> {
    const conflictingGrant = findPermissionGrantBatchConflict(inputs, this.permissionGrants());
    if (conflictingGrant) {
      this.snackbar.open(
        `A permissão ${this.getPermissionGrantLabel(conflictingGrant.permission)} já existe nesse escopo com outra validade. Edite ou remova a concessão atual antes de aplicar.`,
        'Fechar',
        { duration: 6000 },
      );
      return;
    }

    const settledGrants = await Promise.allSettled(
      inputs.map((input) => firstValueFrom(this.permissionGrantsApi.createGrant(input))),
    );
    const createdGrants = settledGrants.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    this.permissionGrants.update((grants) =>
      sortPermissionGrants([
        ...grants.filter((item) => !createdGrants.some((grant) => grant.id === item.id)),
        ...createdGrants,
      ]),
    );
    const failedGrant = settledGrants.find((result) => result.status === 'rejected');
    if (!failedGrant) {
      this.resetPermissionGrantForm();
      this.snackbar.open(messages.success, 'Fechar', { duration: 2500 });
      return;
    }

    await this.loadPermissionGrantsForPerson(selectedPerson);
    if (createdGrants.length > 0) {
      this.resetPermissionGrantForm();
      this.snackbar.open(
        `${createdGrants.length} de ${inputs.length} permissões concedidas. ${getErrorMessage(failedGrant.reason, 'Algumas permissões não puderam ser concedidas.')}`,
        'Fechar',
        { duration: 6000 },
      );
      return;
    }

    this.snackbar.open(getErrorMessage(failedGrant.reason, messages.failure), 'Fechar', { duration: 5000 });
  }

  private async loadPermissionGrantTargets(): Promise<boolean> {
    try {
      const [events, majorEvents, eventGroups] = await Promise.all([
        firstValueFrom(this.permissionGrantsApi.listTargets(EventManagerPermissionGrantScope.Event, { take: 500 })),
        firstValueFrom(this.permissionGrantsApi.listTargets(EventManagerPermissionGrantScope.MajorEvent, { take: 500 })),
        firstValueFrom(this.permissionGrantsApi.listTargets(EventManagerPermissionGrantScope.EventGroup, { take: 500 })),
      ]);

      this.eventPermissionGrantTargets.set(events ?? []);
      this.majorEventPermissionGrantTargets.set(majorEvents ?? []);
      this.eventGroupPermissionGrantTargets.set(eventGroups ?? []);
      return true;
    } catch (error) {
      this.snackbar.open(getErrorMessage(error, 'Não foi possível carregar os alvos de permissão.'), 'Fechar', {
        duration: 5000,
      });
      return false;
    }
  }
}
