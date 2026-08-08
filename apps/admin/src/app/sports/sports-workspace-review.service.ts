import { firstValueFrom } from 'rxjs';
import { getErrorMessage } from '../feedback/error-message';
import { ConfirmationDialogComponent } from '../app-shell/dialogs/confirmation-dialog.component';
import {
  SportsCloneTournamentDialogComponent,
  type SportsCloneTournamentDialogResult,
} from './sports-clone-tournament-dialog.component';
import type { SportsApplication, SportsCategorySummary, SportsMatchReview, SportsTeamRead } from './sports.models';
import { SportsTextDialogComponent } from './sports-text-dialog.component';
import {
  defaultSportEmoji,
  timerRulesFromForm,
  timerRulesToForm,
  toIsoDateOrNull,
  toLocalDate,
} from './sports-workspace-form.utils';
import { sportsMatchStatusLabel, sportsStatusLabel } from './sports-workspace-labels';
import { SportsWorkspaceMatchService } from './sports-workspace-match.service';

type ReviewDecision = 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';

export abstract class SportsWorkspaceReviewService extends SportsWorkspaceMatchService {
  async loadApplications(): Promise<void> {
    if (!this.tournamentId()) {
      return;
    }
    this.applications.set(await firstValueFrom(this.api.applicationQueue(this.tournamentId())));
  }

  async reviewApplication(application: SportsApplication, decision: ReviewDecision): Promise<void> {
    const message =
      decision === 'APPROVED'
        ? null
        : await this.askText(
            'Mensagem da revisão',
            'Explique de forma objetiva o que precisa mudar ou por que a inscrição foi negada.',
            'Mensagem para a pessoa inscrita',
            '',
            true,
          );
    if (decision !== 'APPROVED' && !message) {
      return;
    }
    await this.run('Não foi possível revisar a inscrição.', async () => {
      await firstValueFrom(
        this.api.reviewApplication({
          applicationId: application.id,
          decision,
          reviewMessage: message,
        }),
      );
      await this.loadApplications();
      this.notify('Inscrição revisada.');
    });
  }

  async reviewTeamChange(
    request: NonNullable<SportsTeamRead['changeRequests']>[number],
    decision: ReviewDecision,
  ): Promise<void> {
    const team = this.teamRead()?.team;
    if (!team) {
      return;
    }
    const message =
      decision === 'APPROVED'
        ? null
        : await this.askText(
            'Mensagem da revisão',
            'Descreva o ajuste necessário para que o representante possa reenviar o delta.',
            'Mensagem para o representante',
            '',
            true,
          );
    if (decision !== 'APPROVED' && !message) {
      return;
    }
    await this.run('Não foi possível revisar a alteração.', async () => {
      await firstValueFrom(
        this.api.reviewTeamChange({
          requestId: request.id,
          expectedRequestRevision: request.requestRevision,
          decision,
          reviewMessage: message,
        }),
      );
      await this.selectTeam(team);
      await this.loadTournament();
      this.notify('Alteração revisada.');
    });
  }

  async reviewAction(actionId: string, decision: ReviewDecision): Promise<void> {
    const match = this.matchReview()?.match;
    if (!match) {
      return;
    }
    const message =
      decision === 'APPROVED'
        ? null
        : await this.askText(
            'Orientação da revisão',
            'Explique a correção necessária na ação da partida.',
            'Orientação para o oficial',
            '',
            true,
          );
    if (decision !== 'APPROVED' && !message) {
      return;
    }
    await this.run('Não foi possível revisar a ação.', async () => {
      await firstValueFrom(
        this.api.reviewMatchAction({
          actionId,
          decision,
          reviewMessage: message,
        }),
      );
      await this.selectMatch(match);
      this.notify('Ação da partida revisada.');
    });
  }

  async cloneTournament(): Promise<void> {
    const tournament = this.tournamentRead()?.tournament;
    if (!tournament) {
      return;
    }
    const source = this.majorEvents().find((majorEvent) => majorEvent.id === tournament.majorEventId);
    const result = await firstValueFrom(
      this.dialog
        .open<SportsCloneTournamentDialogComponent, unknown, SportsCloneTournamentDialogResult>(
          SportsCloneTournamentDialogComponent,
          {
            data: {
              sourceMajorEventId: tournament.majorEventId,
              sourceName: source?.name ?? 'Torneio atual',
              destinations: this.majorEvents()
                .filter((majorEvent) => majorEvent.id !== tournament.majorEventId)
                .map((majorEvent) => ({
                  id: majorEvent.id,
                  name: majorEvent.name,
                  emoji: majorEvent.emoji,
                })),
            },
            width: '38rem',
          },
        )
        .afterClosed(),
    );
    if (!result) {
      return;
    }
    await this.run('Não foi possível duplicar o torneio.', async () => {
      const id = await firstValueFrom(
        this.api.mutate<string>('cloneSportsTournament', 'SportsTournamentCloneInput', {
          sourceTournamentId: this.tournamentId(),
          destinationMajorEventId: result.destinationMajorEventId,
          parts: result.parts,
        }),
      );
      await this.loadTournament(id);
      this.tournaments.set(await firstValueFrom(this.api.tournaments({ take: 100 })));
      this.notify('Torneio duplicado e aberto para revisão.');
    });
  }

  teamNameForRegistration(registrationId?: string | null): string {
    if (!registrationId) {
      return 'A definir';
    }
    const registration = this.categoryRead()?.registrations.find((item) => item.id === registrationId);
    return this.tournamentRead()?.teams.find((team) => team.id === registration?.teamId)?.name ?? 'Equipe removida';
  }

  teamModalitiesLabel(teamId: string): string {
    const registrations = this.teamModalities(teamId);
    if (!registrations) {
      return 'Modalidades ainda não carregadas';
    }
    if (!registrations.length) {
      return 'Sem modalidade';
    }
    return registrations.map((registration) => registration.categoryName).join(' · ');
  }

  teamModalities(teamId: string) {
    return this.tournamentRead()?.teamSummaries?.find((item) => item.team.id === teamId)?.registrations ?? null;
  }

  statusLabel(status: string): string {
    return sportsStatusLabel(status);
  }

  matchStatusLabel(status: string): string {
    return sportsMatchStatusLabel(status);
  }

  protected async run(fallback: string, operation: () => Promise<void>, showGlobalLoading = true): Promise<void> {
    if (showGlobalLoading) {
      this.loading.set(true);
    }
    this.error.set(null);
    try {
      await operation();
    } catch (error) {
      const message = getErrorMessage(error, fallback);
      this.error.set(message);
      this.notify(message, true);
    } finally {
      if (showGlobalLoading) {
        this.loading.set(false);
      }
    }
  }

  protected watchTournament(tournamentId: string): void {
    this.liveSubscription?.unsubscribe();
    this.liveSubscription = this.api.watchTournamentReview(tournamentId).subscribe({
      next: () => void this.refreshLiveSnapshot(),
      error: () => {
        this.notify('As atualizações ao vivo foram interrompidas. Reabra o torneio para reconectar.', true);
      },
    });
  }

  protected async loadMatchRegistrations(review: SportsMatchReview): Promise<void> {
    const ids = [review.match.homeRegistrationId, review.match.awayRegistrationId].filter((id): id is string =>
      Boolean(id),
    );
    const reads = await Promise.all(ids.map((id) => firstValueFrom(this.api.registration(id))));
    this.registrationReads.set(Object.fromEntries(reads.map((read) => [read.registration.id, read])));
    this.lineupSelections.set(
      Object.fromEntries(
        reads.map((read) => {
          const roster = review.rosters.find((item) => item.registrationId === read.registration.id);
          return [
            read.registration.id,
            roster?.entries.map((entry) => entry.registrationMemberId) ?? read.members.map((member) => member.id),
          ];
        }),
      ),
    );
    this.lineupDetails.set(
      Object.fromEntries(
        reads.map((read) => {
          const roster = review.rosters.find((item) => item.registrationId === read.registration.id);
          return [
            read.registration.id,
            Object.fromEntries(
              read.members.map((member) => {
                const entry = roster?.entries.find((item) => item.registrationMemberId === member.id);
                return [
                  member.id,
                  {
                    role: entry?.role ?? member.role,
                    shirtNumber: entry?.shirtNumber ?? '',
                  },
                ];
              }),
            ),
          ];
        }),
      ),
    );
  }

  private async refreshLiveSnapshot(): Promise<void> {
    if (this.liveRefreshRunning) {
      this.liveRefreshQueued = true;
      return;
    }
    const tournamentId = this.tournamentId();
    if (!tournamentId) {
      return;
    }
    this.liveRefreshRunning = true;
    try {
      do {
        this.liveRefreshQueued = false;
        const categoryId = this.selectedCategoryId();
        const teamId = this.selectedTeamId();
        const matchId = this.selectedMatchId();
        const [tournament, applications, category, team, match] = await Promise.all([
          firstValueFrom(this.api.tournament(tournamentId)),
          firstValueFrom(this.api.applicationQueue(tournamentId)),
          categoryId ? firstValueFrom(this.api.category(categoryId)) : Promise.resolve(null),
          teamId ? firstValueFrom(this.api.team(teamId)) : Promise.resolve(null),
          matchId ? firstValueFrom(this.api.matchReview(matchId)) : Promise.resolve(null),
        ]);
        this.tournamentRead.set(tournament);
        this.applications.set(applications);
        if (category) {
          this.categoryRead.set(category);
        }
        if (team) {
          this.teamRead.set(team);
        }
        if (match) {
          this.matchReview.set(match);
        }
      } while (this.liveRefreshQueued);
    } catch (error) {
      this.error.set(getErrorMessage(error, 'Não foi possível aplicar uma atualização ao vivo.'));
    } finally {
      this.liveRefreshRunning = false;
    }
  }

  protected notify(message: string, error = false): void {
    this.snackbar.open(message, 'Fechar', {
      duration: error ? 6000 : 3000,
      panelClass: error ? ['snackbar-error'] : undefined,
    });
  }

  protected async confirmAction(title: string, message: string): Promise<boolean> {
    return (
      (await firstValueFrom(
        this.dialog
          .open<ConfirmationDialogComponent, unknown, boolean>(ConfirmationDialogComponent, {
            data: {
              title,
              message,
              confirmLabel: 'Excluir',
              tone: 'danger',
            },
          })
          .afterClosed(),
      )) ?? false
    );
  }

  protected async askText(
    title: string,
    description: string,
    label: string,
    initialValue = '',
    multiline = false,
  ): Promise<string | null> {
    return (
      (await firstValueFrom(
        this.dialog
          .open<SportsTextDialogComponent, unknown, string>(SportsTextDialogComponent, {
            data: { title, description, label, initialValue, multiline },
            width: '34rem',
          })
          .afterClosed(),
      )) ?? null
    );
  }

  protected categoryToForm(category: SportsCategorySummary) {
    return {
      ...category,
      emoji: category.eventGroup?.emoji ?? defaultSportEmoji(category.sport),
      customSportName: category.customSportName ?? '',
      division: category.division ?? '',
      registrationStartDate: toLocalDate(category.registrationStartDate),
      registrationEndDate: toLocalDate(category.registrationEndDate),
      minimumRosterSize: category.minimumRosterSize ?? 0,
      maximumRosterSize: category.maximumRosterSize ?? 0,
      maximumCaptains: category.maximumCaptains ?? 0,
      maximumCoaches: category.maximumCoaches ?? 0,
      allowPlayerMultipleTeams: category.allowPlayerMultipleTeams ?? false,
      maximumPeriods: category.maximumPeriods ?? 0,
      periodLabel: category.periodLabel ?? 'Tempo',
      ...timerRulesToForm(category.timerRulesJson),
      rulesText: category.rulesText ?? '',
      registrationFormId: category.registrationFormId ?? '',
    };
  }

  protected nullableCategoryValues(raw: typeof this.categoryForm.value) {
    return {
      name: raw.name,
      sport: raw.sport,
      customSportName: raw.sport === 'OTHER' ? raw.customSportName || null : null,
      division: raw.division || null,
      format: raw.format,
      status: raw.status,
      registrationStartDate: toIsoDateOrNull(raw.registrationStartDate),
      registrationEndDate: toIsoDateOrNull(raw.registrationEndDate),
      minimumRosterSize: raw.minimumRosterSize || null,
      maximumRosterSize: raw.maximumRosterSize || null,
      maximumCaptains: raw.maximumCaptains || null,
      maximumCoaches: raw.maximumCoaches || null,
      allowPlayerMultipleTeams: raw.allowPlayerMultipleTeams,
      periodsEnabled: raw.periodsEnabled,
      maximumPeriods: raw.periodsEnabled ? raw.maximumPeriods || null : null,
      periodLabel: raw.periodsEnabled ? raw.periodLabel || null : null,
      timerRulesJson: timerRulesFromForm(raw),
      scoreRulesJson: raw.scoreRulesJson,
      rosterRulesJson: raw.rosterRulesJson,
      bracketRulesJson: raw.bracketRulesJson,
      standingsRulesJson: raw.standingsRulesJson,
      rulesText: raw.rulesText || null,
      registrationFormId: raw.registrationFormId || null,
    };
  }
}
