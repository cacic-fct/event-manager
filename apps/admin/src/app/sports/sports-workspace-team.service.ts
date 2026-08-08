import type { SportsTeamMemberStatus } from '@cacic-fct/shared-data-types';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom } from 'rxjs';
import type { SportsCategoryRead, SportsTeamRead, SportsTeamSummary } from './sports.models';
import { SportsWorkspaceCategoryService } from './sports-workspace-category.service';

export abstract class SportsWorkspaceTeamService extends SportsWorkspaceCategoryService {
  async selectTeam(team: SportsTeamSummary): Promise<void> {
    await this.run('Não foi possível carregar a equipe.', async () => {
      const read = await firstValueFrom(this.api.team(team.id));
      if (!read?.team) {
        throw new Error('A resposta da equipe não trouxe os dados esperados.');
      }
      this.teamRead.set(read);
      this.selectedTeamId.set(team.id);
      this.teamForm.patchValue({
        id: read.team.id,
        name: read.team.name,
        institution: read.team.institution ?? '',
        status: read.team.status,
      });
      this.registrationForm.controls.teamId.setValue(team.id);
    });
  }

  async saveTeam(): Promise<void> {
    if (this.teamForm.invalid || !this.tournamentId()) {
      this.teamForm.markAllAsTouched();
      return;
    }
    const raw = this.teamForm.getRawValue();
    const existing = this.teamRead()?.team;
    await this.run('Não foi possível salvar a equipe.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>(
          existing ? 'updateSportsTeam' : 'createSportsTeam',
          existing ? 'SportsTeamUpdateInput' : 'SportsTeamCreateInput',
          existing
            ? {
                id: existing.id,
                expectedRevision: existing.revision,
                name: raw.name,
                institution: raw.institution || null,
                status: raw.status,
              }
            : {
                tournamentId: this.tournamentId(),
                name: raw.name,
                institution: raw.institution || null,
                status: raw.status,
              },
        ),
      );
      await this.loadTournament();
      const team = this.tournamentRead()?.teams.find((item) => item.id === id);
      if (team) {
        await this.selectTeam(team);
      }
      this.notify('Equipe salva.');
    });
  }

  async deleteSelectedTeam(): Promise<void> {
    const team = this.teamRead()?.team;
    if (
      !team ||
      !(await this.confirmAction(
        `Excluir ${team.name}?`,
        'Inscrições e escalações desta equipe serão removidas do torneio.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a equipe.', async () => {
      await firstValueFrom(this.api.deleteVersioned('deleteSportsTeam', team.id, team.revision));
      this.newTeam();
      await this.loadTournament();
    });
  }

  async uploadTeamLogo(file: File): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    if (!['image/avif', 'image/svg+xml', 'image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      this.notify('Use uma imagem AVIF, SVG, PNG, JPEG ou WebP.', true);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      this.notify('O escudo deve ter no máximo 15 MB.', true);
      return;
    }
    await this.run('Não foi possível enviar o escudo.', async () => {
      await firstValueFrom(this.api.uploadTeamLogo(team.id, team.revision, file));
      await this.loadTournament();
      const refreshed = this.tournamentRead()?.teams.find((item) => item.id === team.id);
      if (refreshed) {
        await this.selectTeam(refreshed);
      }
      this.notify('Escudo atualizado e armazenado sem expiração.');
    });
  }

  async cloneSelectedTeam(): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    const destinationTournamentId = await this.askText(
      'Duplicar equipe',
      'O escudo será preservado. Representantes e atletas não serão copiados.',
      'ID do torneio de destino',
      this.tournamentId(),
    );
    if (!destinationTournamentId) {
      return;
    }
    await this.run('Não foi possível duplicar a equipe.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('cloneSportsTeam', 'SportsTeamCloneInput', {
          sourceTeamId: team.id,
          destinationTournamentId,
          name: `${team.name} (cópia)`,
          includeLogo: true,
          includeRepresentatives: false,
          includeMembers: false,
        }),
      );
      if (destinationTournamentId === this.tournamentId()) {
        await this.loadTournament();
      }
      this.notify('Equipe duplicada. Representantes e atletas não foram copiados.');
    });
  }

  async searchPeople(
    query: string,
    target: 'representative' | 'official' | 'member',
  ): Promise<void> {
    const normalized = query.trim();
    if (normalized.length < 2) {
      this.people.set([]);
      this.peopleTarget.set(null);
      return;
    }
    this.peopleTarget.set(target);
    await this.run('Não foi possível buscar pessoas.', async () => {
      this.people.set(await firstValueFrom(this.peopleApi.listPeopleSummaries({ query: normalized, take: 10 })));
    }, false);
  }

  pickPerson(person: Person, target: 'representative' | 'official' | 'member'): void {
    const form =
      target === 'representative'
        ? this.representativeForm
        : target === 'official'
          ? this.officialForm
          : this.memberForm;
    form.patchValue({ personId: person.id, personQuery: person.name });
    this.people.set([]);
    this.peopleTarget.set(null);
  }

  async assignRepresentative(): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team || this.representativeForm.invalid) {
      return;
    }
    await this.run('Não foi possível atribuir o representante.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('assignSportsTeamRepresentative', 'SportsRepresentativeAssignInput', {
          teamId: team.id,
          personId: this.representativeForm.controls.personId.value,
        }),
      );
      await this.selectTeam(team);
      this.representativeForm.reset();
      this.notify('Representante atribuído.');
    });
  }

  async revokeRepresentative(representativeId: string): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    await this.run('Não foi possível revogar o representante.', async () => {
      await firstValueFrom(
        this.api.mutate<boolean>('revokeSportsTeamRepresentative', 'SportsRepresentativeRevokeInput', {
          representativeId,
        }),
      );
      await this.selectTeam(team);
    });
  }

  async addTeamMember(): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team || this.memberForm.invalid) {
      return;
    }
    await this.run('Não foi possível adicionar o integrante.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('createSportsTeamMember', 'SportsTeamMemberCreateInput', {
          teamId: team.id,
          personId: this.memberForm.controls.personId.value,
        }),
      );
      await this.selectTeam(team);
      this.memberForm.reset();
      this.notify('Integrante adicionado. A cobrança foi habilitada quando aplicável.');
    });
  }

  async updateTeamMember(
    member: NonNullable<SportsTeamRead['members']>[number],
    status: SportsTeamMemberStatus,
  ): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    await this.run('Não foi possível alterar o integrante.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('updateSportsTeamMember', 'SportsTeamMemberUpdateInput', {
          id: member.id,
          expectedRevision: member.revision,
          status,
        }),
      );
      await this.selectTeam(team);
      this.notify('Status do integrante atualizado.');
    });
  }

  async assignCategoryRole(): Promise<void> {
    if (this.categoryRoleForm.invalid) {
      return;
    }
    await this.run('Não foi possível atribuir a função na modalidade.', async () => {
      await firstValueFrom(
        this.api.mutate<string>(
          'assignSportsCategoryRole',
          'SportsRegistrationMemberUpsertInput',
          this.categoryRoleForm.getRawValue(),
        ),
      );
      this.notify('Função na modalidade atualizada.');
    });
  }

  async createRegistration(): Promise<void> {
    if (this.registrationForm.invalid) {
      return;
    }
    const raw = this.registrationForm.getRawValue();
    await this.run('Não foi possível inscrever a equipe.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('createSportsRegistration', 'SportsRegistrationCreateInput', {
          teamId: raw.teamId,
          categoryId: raw.categoryId,
          seed: raw.seed || null,
          formAnswersJson: raw.formAnswersJson || null,
        }),
      );
      const category = this.tournamentRead()?.categories.find((item) => item.id === raw.categoryId);
      if (category) {
        await this.selectCategory(category);
      }
      this.notify('Inscrição criada.');
    });
  }

  async setRegistrationStatus(
    registration: NonNullable<SportsCategoryRead['registrations']>[number],
    status: 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'ACTIVE',
  ): Promise<void> {
    const category = this.categoryRead()?.category;
    if (!category) {
      return;
    }
    await this.run('Não foi possível atualizar a inscrição.', async () => {
      await firstValueFrom(
        this.api.mutate<string>('updateSportsRegistration', 'SportsRegistrationUpdateInput', {
          id: registration.id,
          expectedRevision: registration.revision,
          status,
        }),
      );
      await this.selectCategory(category);
      this.notify('Estado da inscrição atualizado.');
    });
  }

  async deleteRegistration(registration: NonNullable<SportsCategoryRead['registrations']>[number]): Promise<void> {
    const category = this.categoryRead()?.category;
    if (
      !category ||
      !(await this.confirmAction(
        'Excluir inscrição?',
        'A equipe deixará esta modalidade e suas escalações serão removidas.',
      ))
    ) {
      return;
    }
    await this.run('Não foi possível excluir a inscrição.', async () => {
      await firstValueFrom(
        this.api.deleteVersioned('deleteSportsRegistration', registration.id, registration.revision),
      );
      await this.selectCategory(category);
    });
  }

  newMatch(): void {
    const categoryId = this.selectedCategoryId();
    this.matchReview.set(null);
    this.selectedMatchId.set('');
    this.matchForm.reset({
      id: '',
      categoryId,
      name: 'Partida',
      startDate: '',
      endDate: '',
      stageId: '',
      venueId: '',
      homeRegistrationId: '',
      awayRegistrationId: '',
      roundNumber: 1,
      bracketPosition: 1,
      groupKey: '',
      state: 'SCHEDULED',
      notes: '',
      livestreamProvider: '',
      livestreamUrl: '',
    });
  }
  protected abstract loadMatchRegistrations(review: import('./sports.models').SportsMatchReview): Promise<void>;
}
