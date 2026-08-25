import { firstValueFrom } from 'rxjs';
import type { SportsCategorySummary } from './sports.models';
import { SportsWorkspaceBaseService } from './sports-workspace-base.service';

export abstract class SportsWorkspaceCategoryService extends SportsWorkspaceBaseService {
  async selectCategory(category: SportsCategorySummary, options: { navigate?: boolean } = {}): Promise<void> {
    this.cancelOfficialEdit();
    const selectionRevision = this.beginSelection();
    await this.run(
      'Não foi possível carregar a modalidade.',
      async () => {
        const read = await firstValueFrom(this.api.category(category.id));
        if (selectionRevision !== this.selectionRevision) {
          return;
        }
        this.categoryRead.set(read);
        this.selectedCategoryId.set(category.id);
        this.categoryForm.patchValue(this.categoryToForm(read.category));
        this.registrationForm.controls.categoryId.setValue(category.id);
        this.matchForm.controls.categoryId.setValue(category.id);
      },
      true,
      true,
    );
    if (selectionRevision !== this.selectionRevision) {
      return;
    }
    if (options.navigate !== false && this.selectedCategoryId() === category.id) {
      this.navigateToArea(this.activeArea() === 'matches' ? 'matches' : 'categories', { categoryId: category.id });
    }
  }

  async saveCategory(): Promise<void> {
    if (this.categoryForm.invalid || !this.tournamentId()) {
      this.categoryForm.markAllAsTouched();
      return;
    }
    const raw = this.categoryForm.getRawValue();
    const existing = this.categoryRead()?.category;
    if (existing ? !this.canUpdateCategory() : !this.canCreateCategory()) {
      return;
    }
    await this.run('Não foi possível salvar a modalidade.', async () => {
      const payload = {
        ...this.nullableCategoryValues(raw),
        emoji: raw.emoji,
        ...(existing
          ? { id: existing.id, expectedRevision: existing.revision }
          : { tournamentId: this.tournamentId() }),
      };
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsCategory' : 'createSportsCategory',
          existing ? 'SportsCategoryUpdateInput' : 'SportsCategoryCreateInput',
          payload,
        ),
      );
      await this.loadTournament();
      const category = this.tournamentRead()?.categories.find((item) => item.id === id);
      if (category) {
        await this.selectCategory(category);
      }
      this.notify('Modalidade salva.');
    });
  }

  async deleteCategory(category: SportsCategorySummary): Promise<void> {
    if (
      !this.canDeleteCategory() ||
      !(await this.confirmAction(
        `Excluir ${category.name}?`,
        'Inscrições, chave e partidas vinculadas serão removidas.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a modalidade.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsCategory', category.id, category.revision));
      this.newCategory();
      await this.loadTournament();
    });
  }

  async cloneSelectedCategory(): Promise<void> {
    const category = this.categoryRead()?.category;
    if (!category || !this.canDuplicateCategory()) {
      return;
    }
    const destinationTournamentId = await this.askText(
      'Duplicar modalidade',
      'Informe o torneio que receberá a cópia. Inscrições e resultados não serão copiados.',
      'ID do torneio de destino',
      this.tournamentId(),
    );
    if (!destinationTournamentId) {
      return;
    }
    await this.run('Não foi possível duplicar a modalidade.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('cloneSportsCategory', 'SportsCategoryCloneInput', {
          sourceCategoryId: category.id,
          destinationTournamentId,
          name: `${category.name} (cópia)`,
          includeRegistrations: false,
          includeStages: false,
          includeOfficials: true,
        }),
      );
      if (destinationTournamentId === this.tournamentId()) {
        await this.loadTournament();
      }
      this.notify('Modalidade duplicada. Inscrições e chave não foram copiadas.');
    });
  }

  newTeam(navigate = true): void {
    this.teamRead.set(null);
    this.selectedTeamId.set('');
    this.teamForm.reset({ id: '', name: '', institution: '', status: 'DRAFT' });
    if (navigate) {
      this.navigateToArea('teams');
    }
  }
  protected abstract askText(
    title: string,
    message: string,
    label: string,
    initialValue?: string,
  ): Promise<string | null>;
  protected abstract categoryToForm(category: SportsCategorySummary): Partial<typeof this.categoryForm.value>;
  protected abstract nullableCategoryValues(raw: typeof this.categoryForm.value): Record<string, unknown>;
}
