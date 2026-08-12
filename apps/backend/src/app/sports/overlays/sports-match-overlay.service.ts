import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SPORTS_OVERLAY_PERIOD_WORD,
  normalizeSportsOverlayPeriodWord,
  type SportsOverlayPeriodWord,
} from '@cacic-fct/shared-data-types';
import type { PublicSportsMatch, PublicSportsTeam } from '../read/sports-read.models';
import { SportsReadService } from '../read/sports-read.service';
import { OVERLAY_ASSET_BASE, OVERLAY_RUNTIME_SCRIPT, OVERLAY_STYLESHEET } from './sports-match-overlay.assets';

export type SportsMatchOverlayTeam = 'both' | 'home' | 'away';

export interface SportsMatchOverlayConfig {
  team: SportsMatchOverlayTeam;
  showTeamName: boolean;
  showTeamIcon: boolean;
  showScore: boolean;
  showStopwatch: boolean;
  showPeriod: boolean;
  showState: boolean;
  periodWord: SportsOverlayPeriodWord;
}

export interface SportsMatchOverlayData {
  id: string;
  homeTeam: SportsMatchOverlayTeamData | null;
  awayTeam: SportsMatchOverlayTeamData | null;
  state: PublicSportsMatch['state'];
  scoreboard: PublicSportsMatch['scoreboard'];
  timerStartedAtUnixMs: number | null;
  elapsedBeforePauseMs: number;
  periodTimers: PublicSportsMatch['periodTimers'];
  overallTimerEnabled: boolean;
}

export interface SportsMatchOverlayTeamData {
  name: string;
  logoUrl?: string | null;
}

export const SPORTS_MATCH_OVERLAY_DEMO_ID = 'demo';

export const DEMO_SPORTS_MATCH_OVERLAY_DATA: SportsMatchOverlayData = {
  id: SPORTS_MATCH_OVERLAY_DEMO_ID,
  homeTeam: { name: 'Equipe A', logoUrl: null },
  awayTeam: { name: 'Equipe B com nome longo', logoUrl: null },
  state: 'LIVE',
  scoreboard: {
    homeScore: 1,
    awayScore: 99,
    activePeriod: 1,
    periods: [{ number: 1, label: '1º período', homeScore: 1, awayScore: 0, completed: false }],
  },
  timerStartedAtUnixMs: null,
  elapsedBeforePauseMs: 90_000,
  periodTimers: [],
  overallTimerEnabled: true,
};

export const DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG: SportsMatchOverlayConfig = {
  team: 'both',
  showTeamName: true,
  showTeamIcon: true,
  showScore: true,
  showStopwatch: true,
  showPeriod: true,
  showState: true,
  periodWord: DEFAULT_SPORTS_OVERLAY_PERIOD_WORD,
};

@Injectable()
export class SportsMatchOverlayService {
  constructor(private readonly sportsRead: SportsReadService) {}

  parseConfig(query: Readonly<Record<string, unknown>>): SportsMatchOverlayConfig {
    return {
      team: this.readTeam(query['team']),
      showTeamName: this.readBoolean(query['teamName'], DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG.showTeamName),
      showTeamIcon: this.readBoolean(query['teamIcon'], DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG.showTeamIcon),
      showScore: this.readBoolean(query['score'], DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG.showScore),
      showStopwatch: this.readBoolean(query['stopwatch'], DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG.showStopwatch),
      showPeriod: this.readBoolean(query['period'], DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG.showPeriod),
      showState: this.readBoolean(query['state'], DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG.showState),
      periodWord: normalizeSportsOverlayPeriodWord(query['periodWord']),
    };
  }

  async data(matchId: string): Promise<SportsMatchOverlayData> {
    if (matchId === SPORTS_MATCH_OVERLAY_DEMO_ID) {
      return this.demoData();
    }
    return this.toOverlayData(await this.sportsRead.publicMatch(matchId));
  }

  async render(matchId: string, query: Readonly<Record<string, unknown>>): Promise<string> {
    if (matchId === SPORTS_MATCH_OVERLAY_DEMO_ID) {
      return this.renderOverlayDocument(this.demoData(), this.parseConfig(query));
    }
    const match = await this.sportsRead.publicMatch(matchId);
    return this.renderOverlayDocument(this.toOverlayData(match), this.parseConfig(query));
  }

  renderDocument(
    match: PublicSportsMatch,
    config: SportsMatchOverlayConfig = DEFAULT_SPORTS_MATCH_OVERLAY_CONFIG,
  ): string {
    return this.renderOverlayDocument(this.toOverlayData(match), config);
  }

  private renderOverlayDocument(data: SportsMatchOverlayData, config: SportsMatchOverlayConfig): string {
    const initialPeriod = this.activePeriod(data);
    const initialState = this.stateLabel(data.state);
    const initialStopwatch = this.formatElapsed(this.currentElapsed(data));
    const dataUrl = `/api/sports/public/matches/${encodeURIComponent(data.id)}/overlay/data`;
    const eventsUrl = `/api/sports/matches/${encodeURIComponent(data.id)}/events`;

    return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${this.escapeHtml(`Overlay esportivo - ${data.id}`)}</title>
    <link rel="stylesheet" href="${OVERLAY_ASSET_BASE}.css">
  </head>
  <body>
    <main
      class="sports-overlay"
      data-sports-match-overlay
      data-match-id="${this.escapeHtml(data.id)}"
      data-data-url="${this.escapeHtml(dataUrl)}"
      data-events-url="${this.escapeHtml(eventsUrl)}"
      data-team="${config.team}"
      data-team-name="${String(config.showTeamName)}"
      data-team-icon="${String(config.showTeamIcon)}"
      data-score="${String(config.showScore)}"
      data-stopwatch="${String(config.showStopwatch)}"
      data-period="${String(config.showPeriod)}"
      data-state="${String(config.showState)}"
      data-period-word="${this.escapeHtml(config.periodWord)}"
    >
      ${this.renderTeam('home', data.homeTeam, data.scoreboard.homeScore, config)}
      <div class="sports-overlay__center" data-role="center">
        <span class="sports-overlay__state" data-role="state"${config.showState ? '' : ' hidden'}>${this.escapeHtml(initialState)}</span>
        <strong class="sports-overlay__stopwatch" data-role="stopwatch"${config.showStopwatch && data.overallTimerEnabled ? '' : ' hidden'}>${initialStopwatch}</strong>
        <span class="sports-overlay__period" data-role="period"${config.showPeriod && initialPeriod !== null ? '' : ' hidden'}>${initialPeriod === null ? '' : this.escapeHtml(`${config.periodWord} ${initialPeriod}`)}</span>
      </div>
      ${this.renderTeam('away', data.awayTeam, data.scoreboard.awayScore, config)}
    </main>
    <script defer src="${OVERLAY_ASSET_BASE}.js"></script>
  </body>
</html>`;
  }

  stylesheet(): string {
    return OVERLAY_STYLESHEET;
  }

  script(): string {
    return OVERLAY_RUNTIME_SCRIPT;
  }

  toOverlayData(match: PublicSportsMatch): SportsMatchOverlayData {
    return {
      id: match.id,
      homeTeam: this.mapTeam(match.homeTeam),
      awayTeam: this.mapTeam(match.awayTeam),
      state: match.state,
      scoreboard: match.scoreboard,
      timerStartedAtUnixMs: match.timerStartedAtUnixMs ?? null,
      elapsedBeforePauseMs: match.elapsedBeforePauseMs,
      periodTimers: match.periodTimers,
      overallTimerEnabled: match.overallTimerEnabled,
    };
  }

  private demoData(): SportsMatchOverlayData {
    return {
      ...DEMO_SPORTS_MATCH_OVERLAY_DATA,
      homeTeam: DEMO_SPORTS_MATCH_OVERLAY_DATA.homeTeam ? { ...DEMO_SPORTS_MATCH_OVERLAY_DATA.homeTeam } : null,
      awayTeam: DEMO_SPORTS_MATCH_OVERLAY_DATA.awayTeam ? { ...DEMO_SPORTS_MATCH_OVERLAY_DATA.awayTeam } : null,
      scoreboard: {
        ...DEMO_SPORTS_MATCH_OVERLAY_DATA.scoreboard,
        periods: DEMO_SPORTS_MATCH_OVERLAY_DATA.scoreboard.periods.map((period) => ({ ...period })),
      },
      periodTimers: DEMO_SPORTS_MATCH_OVERLAY_DATA.periodTimers.map((timer) => ({ ...timer })),
    };
  }

  private renderTeam(
    side: 'home' | 'away',
    team: SportsMatchOverlayTeamData | null,
    score: number,
    config: SportsMatchOverlayConfig,
  ): string {
    const name = team?.name || (side === 'home' ? 'Equipe da casa' : 'Equipe visitante');
    const logoUrl = team?.logoUrl ?? null;
    const visible = config.team === 'both' || config.team === side;
    return `<section class="sports-overlay__team" data-side="${side}"${visible ? '' : ' hidden'} aria-label="${this.escapeHtml(name)}">
        <span class="sports-overlay__icon" data-role="icon"${config.showTeamIcon ? '' : ' hidden'} aria-hidden="true">
          <img class="sports-overlay__logo" data-role="logo" alt="" width="56" height="56"${logoUrl ? ` src="${this.escapeHtml(logoUrl)}"` : ''}${logoUrl ? '' : ' hidden'}>
          <span class="sports-overlay__icon-placeholder" data-role="placeholder"${logoUrl ? ' hidden' : ''}>${this.escapeHtml(this.teamInitials(name))}</span>
        </span>
        <span class="sports-overlay__team-name" data-role="team-name"${config.showTeamName ? '' : ' hidden'}>${this.escapeHtml(name)}</span>
        <strong class="sports-overlay__score" data-role="score"${config.showScore ? '' : ' hidden'}>${score}</strong>
      </section>`;
  }

  private mapTeam(team: PublicSportsTeam | null | undefined): SportsMatchOverlayTeamData | null {
    return team
      ? {
          name: team.name,
          logoUrl: team.logoUrl,
        }
      : null;
  }

  private activePeriod(data: SportsMatchOverlayData): number | null {
    return data.scoreboard.activePeriod ?? data.scoreboard.periods.at(-1)?.number ?? null;
  }

  private currentElapsed(data: SportsMatchOverlayData, now = Date.now()): number {
    const running =
      data.state === 'LIVE' && data.timerStartedAtUnixMs !== null ? Math.max(0, now - data.timerStartedAtUnixMs) : 0;
    return data.elapsedBeforePauseMs + running;
  }

  private formatElapsed(value: number): string {
    const totalSeconds = Math.floor(Math.max(0, value) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  private stateLabel(state: PublicSportsMatch['state']): string {
    return {
      SCHEDULED: 'Agendada',
      CHECK_IN: 'Check-in',
      LIVE: 'Ao vivo',
      PAUSED: 'Pausada',
      AWAITING_REVIEW: 'Em revisão',
      CANCELED: 'Cancelada',
      DRAW: 'Empate',
      FINISHED: 'Finalizada',
    }[state];
  }

  private readTeam(value: unknown): SportsMatchOverlayTeam {
    return value === 'home' || value === 'away' ? value : 'both';
  }

  private readBoolean(value: unknown, fallback: boolean): boolean {
    if (value === true || value === false) {
      return value;
    }
    if (typeof value !== 'string') {
      return fallback;
    }
    if (['1', 'true', 'on', 'yes'].includes(value.toLowerCase())) {
      return true;
    }
    if (['0', 'false', 'off', 'no'].includes(value.toLowerCase())) {
      return false;
    }
    return fallback;
  }

  private teamInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    return (
      parts
        .slice(0, 2)
        .map((part) => part[0])
        .join('') || '?'
    ).toLocaleUpperCase('pt-BR');
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[character] ?? character,
    );
  }
}
