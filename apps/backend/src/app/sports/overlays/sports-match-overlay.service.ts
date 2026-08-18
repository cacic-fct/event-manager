import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SPORTS_OVERLAY_PERIOD_WORD,
  normalizeSportsOverlayPeriodWord,
  type SportsOverlayPeriodWord,
} from '@cacic-fct/shared-data-types';
import type { PublicSportsMatch, PublicSportsTeam } from '../read/sports-read.models';
import { SportsReadService } from '../read/sports-read.service';
import { OVERLAY_RUNTIME_SCRIPT } from './sports-match-overlay';

const OVERLAY_STYLESHEET = readFileSync(join(__dirname, 'sports-match-overlay.css'), 'utf8');
const DEMO_INITIAL_ELAPSED_MS = 90_000;
const DEMO_SPORTS_MATCH_OVERLAY_LOGO_URL = 'https://eventos.cacic.com.br/app/icons/favicon.svg';

function cspHash(value: string): string {
  return `'sha256-${createHash('sha256').update(value).digest('base64')}'`;
}

const SPORTS_MATCH_OVERLAY_DEMO_IMAGE_SOURCE = 'https://eventos.cacic.com.br';

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
  awayTeam: { name: 'Equipe B com nome longo', logoUrl: DEMO_SPORTS_MATCH_OVERLAY_LOGO_URL },
  state: 'LIVE',
  scoreboard: {
    homeScore: 1,
    awayScore: 99,
    activePeriod: 1,
    periods: [{ number: 1, label: '1º período', homeScore: 1, awayScore: 99, completed: false }],
  },
  timerStartedAtUnixMs: null,
  elapsedBeforePauseMs: DEMO_INITIAL_ELAPSED_MS,
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
<html id="sports-match-overlay-document" lang="pt-BR">
  <head id="sports-match-overlay-head">
    <meta id="sports-match-overlay-charset" charset="utf-8">
    <meta id="sports-match-overlay-viewport" name="viewport" content="width=device-width, initial-scale=1">
    <title id="sports-match-overlay-title">${this.escapeHtml(`Overlay esportivo - ${data.id}`)}</title>
    <style id="sports-match-overlay-stylesheet">${OVERLAY_STYLESHEET}</style>
  </head>
  <body id="sports-match-overlay-body">
    <main
      id="sports-match-overlay"
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
      <div id="sports-match-overlay-center" class="sports-overlay__center" data-role="center">
        <span id="sports-match-overlay-state" class="sports-overlay__state" data-role="state"${config.showState ? '' : ' hidden'}>${this.escapeHtml(initialState)}</span>
        <strong id="sports-match-overlay-stopwatch" class="sports-overlay__stopwatch" data-role="stopwatch"${config.showStopwatch && data.overallTimerEnabled ? '' : ' hidden'}>${initialStopwatch}</strong>
        <span id="sports-match-overlay-period" class="sports-overlay__period" data-role="period"${config.showPeriod && initialPeriod !== null ? '' : ' hidden'}>${initialPeriod === null ? '' : this.escapeHtml(`${config.periodWord} ${initialPeriod}`)}</span>
      </div>
      ${this.renderTeam('away', data.awayTeam, data.scoreboard.awayScore, config)}
    </main>
    <script id="sports-match-overlay-runtime" defer>${OVERLAY_RUNTIME_SCRIPT}</script>
  </body>
</html>`;
  }

  stylesheet(): string {
    return OVERLAY_STYLESHEET;
  }

  contentSecurityPolicy(matchId: string): string {
    const demoImageSource = matchId === SPORTS_MATCH_OVERLAY_DEMO_ID
      ? ` ${SPORTS_MATCH_OVERLAY_DEMO_IMAGE_SOURCE}`
      : '';
    return [
      "default-src 'none'",
      "base-uri 'none'",
      `script-src 'self' ${cspHash(OVERLAY_RUNTIME_SCRIPT)}`,
      `style-src 'self' ${cspHash(OVERLAY_STYLESHEET)}`,
      `img-src 'self' data:${demoImageSource}`,
      "connect-src 'self'",
    ].join('; ');
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
      timerStartedAtUnixMs: Date.now() - DEMO_INITIAL_ELAPSED_MS,
      elapsedBeforePauseMs: 0,
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
    const icon = `<span id="sports-match-overlay-${side}-icon" class="sports-overlay__icon" data-role="icon"${config.showTeamIcon ? '' : ' hidden'} aria-hidden="true">
          <img id="sports-match-overlay-${side}-logo" class="sports-overlay__logo" data-role="logo" alt="" width="56" height="56"${logoUrl ? ` src="${this.escapeHtml(logoUrl)}"` : ''}${logoUrl ? '' : ' hidden'}>
          <span id="sports-match-overlay-${side}-icon-placeholder" class="sports-overlay__icon-placeholder" data-role="placeholder"${logoUrl ? ' hidden' : ''}>${this.escapeHtml(this.teamInitials(name))}</span>
        </span>`;
    const nameElement = `<span id="sports-match-overlay-${side}-name" class="sports-overlay__team-name" data-role="team-name"${config.showTeamName ? '' : ' hidden'}>${this.escapeHtml(name)}</span>`;
    const scoreElement = `<strong id="sports-match-overlay-${side}-score" class="sports-overlay__score" data-role="score"${config.showScore ? '' : ' hidden'}>${score}</strong>`;
    const elements = side === 'away' ? [scoreElement, nameElement, icon] : [icon, nameElement, scoreElement];
    return `<section id="sports-match-overlay-${side}-team" class="sports-overlay__team sports-overlay__team--${side}" data-side="${side}"${visible ? '' : ' hidden'} aria-label="${this.escapeHtml(name)}">
        ${elements.join('\n        ')}
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
