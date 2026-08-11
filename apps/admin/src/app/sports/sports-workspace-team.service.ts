import { computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { FormResponseAnswer } from '@cacic-fct/form-contracts';
import { parseFormElementsJson, serializeFormAnswers } from '@cacic-fct/shared-angular';
import type { SportsTeamMemberStatus } from '@cacic-fct/shared-data-types';
import type { Person } from '@cacic-fct/event-manager-admin-contracts';
import { firstValueFrom } from 'rxjs';
import type { SportsCategoryRead, SportsTeamRead, SportsTeamSummary } from './sports.models';
import { SportsWorkspaceCategoryService } from './sports-workspace-category.service';

export abstract class SportsWorkspaceTeamService extends SportsWorkspaceCategoryService {
  private readonly registrationCategoryId = toSignal(this.registrationForm.controls.categoryId.valueChanges, {
    initialValue: this.registrationForm.controls.categoryId.value,
  });
  readonly registrationCategory = computed(() =>
    this.tournamentRead()?.categories.find(
      (category) => category.id === this.registrationCategoryId(),
    ),
  );
  readonly registrationEventForm = computed(() => {
    const formId = this.registrationCategory()?.registrationFormId;
    return formId ? this.eventForms().find((form) => form.id === formId) ?? null : null;
  });
  readonly registrationFormElements = computed(() => parseFormElementsJson(this.registrationEventForm()?.elementsJson));
  readonly approvedTeamMemberCount = computed(
    () => this.teamRead()?.members.filter((member) => member.status === 'APPROVED').length ?? 0,
  );

  readonly automaticTeamCategories = computed(() => {
    const read = this.teamRead();
    const categories = this.tournamentRead()?.categories ?? [];
    if (!read) {
      return [];
    }
    const registeredCategoryIds = new Set(read.registrations.map((registration) => registration.categoryId));
    const approvedMemberCount = this.approvedTeamMemberCount();
    return categories.filter((category) => {
      const requiredMembers = Math.max(category.minimumRosterSize ?? 0, 1);
      return (
        !registeredCategoryIds.has(category.id) &&
        !['FINISHED', 'CANCELED'].includes(category.status) &&
        approvedMemberCount >= requiredMembers
      );
    });
  });

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

  async searchPeople(query: string, target: 'representative' | 'official' | 'member'): Promise<void> {
    const normalized = query.trim();
    if (normalized.length < 2) {
      this.people.set([]);
      this.peopleTarget.set(null);
      return;
    }
    this.peopleTarget.set(target);
    await this.run(
      'Não foi possível buscar pessoas.',
      async () => {
        this.people.set(await firstValueFrom(this.peopleApi.listPeopleSummaries({ query: normalized, take: 10 })));
      },
      false,
    );
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

  async createRegistration(answers?: readonly FormResponseAnswer[]): Promise<void> {
    if (this.registrationForm.invalid) {
      return;
    }
    const raw = this.registrationForm.getRawValue();
    const formAnswersJson = answers ? serializeFormAnswers(answers) : raw.formAnswersJson;
    const teamRead = this.teamRead();
    await this.run('Não foi possível inscrever a equipe.', async () => {
      await this.createRegistrationAndAssignApprovedMembers(
        {
          teamId: raw.teamId,
          categoryId: raw.categoryId,
          seed: raw.seed || null,
          formAnswersJson: formAnswersJson === '[]' ? null : formAnswersJson || null,
        },
        teamRead,
      );
      await this.refreshSelectedTeamAfterRegistration(teamRead?.team.id ?? raw.teamId);
      this.notify('Inscrição criada. Atletas aprovados adicionados ao elenco da modalidade.');
    });
  }


  async autoRegisterTeamInEligibleCategories(): Promise<void> {
    const teamRead = this.teamRead();
    const categories = this.automaticTeamCategories();
    if (!teamRead || !categories.length) {
      this.notify('Nenhuma modalidade nova atende ao mínimo de atletas aprovados.', true);
      return;
    }
    await this.run('Não foi possível concluir as inscrições automáticas.', async () => {
      for (const category of categories) {
        await this.createRegistrationAndAssignApprovedMembers(
          {
            teamId: teamRead.team.id,
            categoryId: category.id,
            seed: null,
            formAnswersJson: null,
          },
          this.teamRead() ?? teamRead,
        );
      }
      await this.refreshSelectedTeamAfterRegistration(teamRead.team.id);
      this.notify(
        `${categories.length} modalidade${categories.length === 1 ? '' : 's'} inscrita${categories.length === 1 ? '' : 's'}.`,
      );
    });
  }

  private async createRegistrationAndAssignApprovedMembers(
    input: {
      teamId: string;
      categoryId: string;
      seed: number | null;
      formAnswersJson: string | null;
    },
    teamRead: SportsTeamRead | null,
  ): Promise<void> {
    let registrationId: string;
    try {
      registrationId = await firstValueFrom(
        this.api.mutate<string>('createSportsRegistration', 'SportsRegistrationCreateInput', input),
      );
    } catch (error) {
      const recovered = await this.recoverRegistrationAfterFailure(input.teamId, input.categoryId).catch(() => null);
      if (!recovered) {
        throw error;
      }
      await this.assignApprovedMembersToRegistration(recovered.registration.id, recovered.teamRead);
      return;
    }

    if (teamRead) {
      await this.assignApprovedMembersWithRecovery(
        registrationId,
        input.teamId,
        input.categoryId,
        teamRead,
      );
    }
  }

  private async assignApprovedMembersWithRecovery(
    registrationId: string,
    teamId: string,
    categoryId: string,
    teamRead: SportsTeamRead,
  ): Promise<void> {
    try {
      await this.assignApprovedMembersToRegistration(registrationId, teamRead);
    } catch (error) {
      const recovered = await this.recoverRegistrationAfterFailure(teamId, categoryId).catch(() => null);
      if (!recovered) {
        throw error;
      }
      await this.assignApprovedMembersToRegistration(recovered.registration.id, recovered.teamRead);
    }
  }

  private async recoverRegistrationAfterFailure(
    teamId: string,
    categoryId: string,
  ): Promise<{
    registration: SportsTeamRead['registrations'][number];
    teamRead: SportsTeamRead;
  } | null> {
    const refreshed = await firstValueFrom(this.api.team(teamId));
    if (!refreshed) {
      return null;
    }
    this.teamRead.set(refreshed);
    const registration = refreshed.registrations.find((item) => item.categoryId === categoryId);
    return registration ? { registration, teamRead: refreshed } : null;
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

  private async assignApprovedMembersToRegistration(registrationId: string, teamRead: SportsTeamRead): Promise<void> {
    const approvedMembers = teamRead.members.filter((member) => member.status === 'APPROVED');
    const results = await Promise.allSettled(
      approvedMembers.map((member) =>
        firstValueFrom(
          this.api.mutate<string>('assignSportsCategoryRole', 'SportsRegistrationMemberUpsertInput', {
            registrationId,
            teamMemberId: member.id,
            role: 'PLAYER',
          }),
        ),
      ),
    );
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') {
      throw failure.reason;
    }
  }

  private async refreshSelectedTeamAfterRegistration(teamId: string): Promise<void> {
    await this.loadTournament();
    const team = this.tournamentRead()?.teams.find((item) => item.id === teamId);
    if (team) {
      await this.selectTeam(team);
    }
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
