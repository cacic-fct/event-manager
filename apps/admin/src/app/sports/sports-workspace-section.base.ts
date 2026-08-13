import { computed, inject } from '@angular/core';
import type {
  SportsBracketStageView,
  SportsBracketStandingView,
  SportsBracketTeamView,
} from '@cacic-fct/shared-angular';
import {
  getDefaultSportsEmoji,
  SPORTS_MATCH_STATE_LABELS,
  SPORTS_PRESET_KEYS,
  SPORTS_PRESETS,
  SPORTS_ROSTER_ROLE_LABELS,
  SPORTS_TIMER_PRESET_KEYS,
  SPORTS_TIMER_PRESETS,
} from '@cacic-fct/shared-data-types/sports-metadata';
import { formatIdentityDocumentForExport } from '@cacic-fct/shared-utils';
import { SPORTS_FORMAT_OPTIONS } from './sports-format-options';
import type { SportsCategoryRead } from './sports.models';
import { SportsWorkspaceService } from './sports-workspace.service';

export abstract class SportsWorkspaceSection {
  protected readonly workspace = inject(SportsWorkspaceService);

  protected readonly tournamentStatuses = [
    ['DRAFT', 'Rascunho'],
    ['REGISTRATION_OPEN', 'Inscrições abertas'],
    ['REGISTRATION_CLOSED', 'Inscrições encerradas'],
    ['LIVE', 'Em andamento'],
    ['FINISHED', 'Finalizado'],
    ['CANCELED', 'Cancelado'],
  ] as const;
  protected readonly categoryStatuses = [
    ['DRAFT', 'Rascunho'],
    ['REGISTRATION_OPEN', 'Inscrições abertas'],
    ['REGISTRATION_CLOSED', 'Inscrições encerradas'],
    ['ACTIVE', 'Ativa'],
    ['FINISHED', 'Finalizada'],
    ['CANCELED', 'Cancelada para reagendamento'],
  ] as const;
  protected readonly teamStatuses = [
    ['DRAFT', 'Rascunho'],
    ['PENDING_APPROVAL', 'Aguardando aprovação'],
    ['ACTIVE', 'Ativa'],
    ['CHANGES_REQUESTED', 'Ajustes solicitados'],
    ['REJECTED', 'Rejeitada'],
    ['SUSPENDED', 'Suspensa'],
    ['WITHDRAWN', 'Desistiu'],
  ] as const;
  protected readonly sports = SPORTS_PRESET_KEYS.map((key) => [key, SPORTS_PRESETS[key].label] as const);
  protected readonly formats = SPORTS_FORMAT_OPTIONS;
  protected readonly timerPresets = SPORTS_TIMER_PRESET_KEYS.map((key) => SPORTS_TIMER_PRESETS[key]);
  protected readonly matchStates = Object.entries(SPORTS_MATCH_STATE_LABELS);

  protected readonly bracketStages = computed<SportsBracketStageView[]>(() => {
    const read = this.workspace.categoryRead();
    if (!read) return [];
    return read.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      type: stage.type,
      displayOrder: stage.displayOrder,
      matches: read.matches
        .filter((match) => match.stageId === stage.id)
        .map((match) => ({
          id: match.id,
          roundNumber: match.roundNumber,
          bracketPosition: match.bracketPosition,
          groupKey: match.groupKey,
          state: match.state,
          homeTeam: this.bracketTeam(read, match.homeRegistrationId),
          awayTeam: this.bracketTeam(read, match.awayRegistrationId),
          scoreboard: match.scoreboard,
        })),
    }));
  });

  protected readonly bracketStandings = computed<SportsBracketStandingView[]>(() => {
    const read = this.workspace.categoryRead();
    if (!read) return [];
    return read.standings.map((standing) => ({
      team: this.bracketTeam(read, standing.registrationId) ?? {
        id: standing.registrationId,
        name: 'Equipe removida',
      },
      played: standing.played,
      wins: standing.wins,
      draws: standing.draws,
      losses: standing.losses,
      points: standing.points,
    }));
  });

  protected formatLabel(value: string): string {
    return this.formats.find((format) => format.value === value)?.label ?? value;
  }

  protected sportEmoji(value: string): string {
    return getDefaultSportsEmoji(value);
  }

  protected categoryName(categoryId: string): string {
    return this.workspace.tournamentRead()?.categories.find((item) => item.id === categoryId)?.name ?? 'Modalidade';
  }

  protected categoryStatusLabel(status: string): string {
    return this.categoryStatuses.find((item) => item[0] === status)?.[1] ?? status;
  }

  protected teamLogoForRegistration(registrationId?: string | null): string | null {
    if (!registrationId) return null;
    const registration = this.workspace.categoryRead()?.registrations.find((item) => item.id === registrationId);
    return this.workspace.tournamentRead()?.teams.find((team) => team.id === registration?.teamId)?.logoUrl ?? null;
  }

  protected lineupRoleLabel(role: string): string {
    return (
      SPORTS_ROSTER_ROLE_LABELS[role as keyof typeof SPORTS_ROSTER_ROLE_LABELS] ??
      (role === 'STAFF' ? 'Apoio' : 'Integrante')
    );
  }

  protected selectCategoryById(categoryId: string): void {
    const category = this.workspace.tournamentRead()?.categories.find((item) => item.id === categoryId);
    if (category) void this.workspace.selectCategory(category);
  }

  protected selectBracketMatch(read: SportsCategoryRead, matchId: string): void {
    const match = read.matches.find((item) => item.id === matchId);
    if (match) void this.workspace.selectMatch(match);
  }

  protected officialRoleLabel(role: string): string {
    return (
      {
        REFEREE: 'Árbitro',
        INTERMEDIATOR: 'Intermediador',
        SCOREKEEPER: 'Mesário',
      }[role] ?? 'Função esportiva'
    );
  }

  protected personIdentityDocument(value: string | null | undefined): string {
    return formatIdentityDocumentForExport(value, 'masked') || 'Documento não informado';
  }

  protected changeTypeLabel(type: string): string {
    return (
      {
        TEAM_DETAILS: 'Dados da equipe',
        MEMBER_ADD: 'Inclusão de integrante',
        MEMBER_UPDATE: 'Alteração de integrante',
        MEMBER_REMOVE: 'Remoção de integrante',
        LOGO: 'Escudo da equipe',
        REPRESENTATIVE: 'Representante',
        CATEGORY_ROLE: 'Função na modalidade',
        LINEUP: 'Escalação',
      }[type] ?? 'Alteração da equipe'
    );
  }

  protected actionTypeLabel(type: string): string {
    return (
      {
        CHECK_IN: 'Credenciamento',
        START: 'Início da partida',
        PAUSE: 'Pausa',
        RESUME: 'Retomada',
        SCORE_DELTA: 'Alteração de placar',
        SCORE_CORRECTION: 'Correção de placar',
        PERIOD_ROLL: 'Troca de período',
        FINALIZE: 'Finalização',
        CANCEL: 'Cancelamento para reagendamento',
        RESCHEDULE: 'Reagendamento',
        FORFEIT: 'Desistência',
        RESET: 'Reinício administrativo',
      }[type] ?? 'Ação da partida'
    );
  }

  protected scoreSourceLabel(source: string): string {
    return (
      { PLACEMENT: 'Colocação', MATCH: 'Resultado de partida', MANUAL: 'Ajuste manual', PENALTY: 'Penalidade' }[
        source
      ] ?? 'Outra origem'
    );
  }

  protected uploadTeamLogo(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      void this.workspace.uploadTeamLogo(file);
      input.value = '';
    }
  }

  private bracketTeam(read: SportsCategoryRead, registrationId?: string | null): SportsBracketTeamView | null {
    if (!registrationId) return null;
    const registration = read.registrations.find((item) => item.id === registrationId);
    const team = this.workspace.tournamentRead()?.teams.find((item) => item.id === registration?.teamId);
    return team ? { id: team.id, name: team.name, logoUrl: team.logoUrl } : null;
  }
}
