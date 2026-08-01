import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  SportsBracketComponent,
  TwemojiComponent,
  type SportsBracketStageView,
  type SportsBracketStandingView,
  type SportsBracketTeamView,
} from '@cacic-fct/shared-angular';
import { ActivatedRoute } from '@angular/router';
import { SportsApiService } from './sports-api.service';
import {
  SPORTS_FORMAT_OPTIONS,
  SportsFormatGuideComponent,
} from './sports-format-guide.component';
import type { SportsCategoryRead } from './sports.models';
import { SportsWorkspaceService } from './sports-workspace.service';

@Component({
  selector: 'app-workspace-sports-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTooltipModule,
    SportsBracketComponent,
    TwemojiComponent,
    SportsFormatGuideComponent,
  ],
  providers: [SportsApiService, SportsWorkspaceService],
  templateUrl: './sports-page.component.html',
  styleUrls: [
    '../app-shell/layout/page-layout.shared.scss',
    '../app-shell/layout/lists-layout.shared.scss',
    '../app-shell/layout/forms-feedback.shared.scss',
    './sports-page.component.scss',
  ],
})
export class SportsPageComponent implements OnInit {
  protected readonly workspace = inject(SportsWorkspaceService);
  private readonly route = inject(ActivatedRoute);

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
    ['ACTIVE', 'Em andamento'],
    ['FINISHED', 'Finalizada'],
    ['CANCELED', 'Cancelada para reagendamento'],
  ] as const;

  protected readonly bracketStages = computed<SportsBracketStageView[]>(() => {
    const read = this.workspace.categoryRead();
    if (!read) {
      return [];
    }
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
    if (!read) {
      return [];
    }
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

  protected readonly currentLiveMatchId = computed(
    () => this.workspace.categoryRead()?.matches.find((match) => match.state === 'LIVE')?.id ?? null,
  );
  protected readonly teamStatuses = [
    ['DRAFT', 'Rascunho'],
    ['PENDING_APPROVAL', 'Aguardando aprovação'],
    ['ACTIVE', 'Ativa'],
    ['CHANGES_REQUESTED', 'Ajustes solicitados'],
    ['REJECTED', 'Rejeitada'],
    ['SUSPENDED', 'Suspensa'],
    ['WITHDRAWN', 'Desistiu'],
  ] as const;
  protected readonly sports = [
    ['SOCCER', 'Futebol'],
    ['FUTSAL', 'Futsal'],
    ['TENNIS', 'Tênis'],
    ['BASKETBALL', 'Basquete'],
    ['ESPORTS', 'E-sports'],
    ['CHESS', 'Xadrez'],
    ['VOLLEYBALL', 'Vôlei'],
    ['SWIMMING', 'Natação'],
    ['TABLE_TENNIS', 'Tênis de mesa'],
    ['HANDBALL', 'Handebol'],
    ['OTHER', 'Outro'],
  ] as const;
  protected readonly formats = SPORTS_FORMAT_OPTIONS;
  protected readonly matchStates = [
    ['SCHEDULED', 'Agendada'],
    ['CHECK_IN', 'Credenciamento'],
    ['LIVE', 'Ao vivo'],
    ['PAUSED', 'Pausada'],
    ['AWAITING_REVIEW', 'Em revisão'],
    ['CANCELED', 'Cancelada'],
    ['DRAW', 'Empate'],
    ['FINISHED', 'Finalizada'],
  ] as const;

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.workspace.initialize();
    const tournamentId = this.route.snapshot.paramMap.get('tournamentId');
    if (tournamentId) {
      await this.workspace.loadTournament(tournamentId);
    }
  }

  protected setArea(area: 'overview' | 'categories' | 'teams' | 'matches' | 'reviews'): void {
    this.workspace.activeArea.set(area);
  }

  protected formatLabel(value: string): string {
    return this.formats.find((format) => format.value === value)?.label ?? value;
  }

  protected sportEmoji(value: string): string {
    return (
      {
        SOCCER: '⚽',
        FUTSAL: '⚽',
        TENNIS: '🎾',
        BASKETBALL: '🏀',
        ESPORTS: '🎮',
        CHESS: '♟️',
        VOLLEYBALL: '🏐',
        SWIMMING: '🏊',
        TABLE_TENNIS: '🏓',
        HANDBALL: '🤾',
        OTHER: '🏅',
      }[value] ?? '🏅'
    );
  }

  protected updateNewCategoryEmoji(sport: string): void {
    if (!this.workspace.categoryRead()) {
      this.workspace.categoryForm.controls.emoji.setValue(this.sportEmoji(sport));
    }
  }

  protected categoryName(categoryId: string): string {
    return this.workspace.tournamentRead()?.categories.find((item) => item.id === categoryId)?.name ?? 'Modalidade';
  }

  protected categoryStatusLabel(status: string): string {
    return this.categoryStatuses.find((item) => item[0] === status)?.[1] ?? status;
  }

  protected selectCategoryById(categoryId: string): void {
    const category = this.workspace.tournamentRead()?.categories.find((item) => item.id === categoryId);
    if (category) {
      void this.workspace.selectCategory(category);
    }
  }

  protected selectBracketMatch(read: SportsCategoryRead, matchId: string): void {
    const match = read.matches.find((item) => item.id === matchId);
    if (match) {
      void this.workspace.selectMatch(match);
    }
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
      {
        PLACEMENT: 'Colocação',
        MATCH: 'Resultado de partida',
        MANUAL: 'Ajuste manual',
        PENALTY: 'Penalidade',
      }[source] ?? 'Outra origem'
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

  private bracketTeam(
    read: SportsCategoryRead,
    registrationId?: string | null,
  ): SportsBracketTeamView | null {
    if (!registrationId) {
      return null;
    }
    const registration = read.registrations.find((item) => item.id === registrationId);
    const team = this.workspace
      .tournamentRead()
      ?.teams.find((item) => item.id === registration?.teamId);
    return team ? { id: team.id, name: team.name, logoUrl: team.logoUrl } : null;
  }
}
