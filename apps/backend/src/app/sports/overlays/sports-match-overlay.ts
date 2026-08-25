type OverlaySide = 'home' | 'away';
type OverlayElement = 'team' | 'icon' | 'logo' | 'icon-placeholder' | 'name' | 'score';

interface OverlayTeam {
  name?: string | null;
  logoUrl?: string | null;
}

interface OverlayMatch {
  homeTeam?: OverlayTeam | null;
  awayTeam?: OverlayTeam | null;
  state?: string | null;
  scoreboard?: {
    homeScore?: number | null;
    awayScore?: number | null;
    activePeriod?: number | null;
    periods?: Array<{ number?: number | null }>;
  } | null;
  timerStartedAtUnixMs?: number | null;
  elapsedBeforePauseMs?: number | null;
  overallTimerEnabled?: boolean;
}

function initializeSportsMatchOverlay(): void {
  const root = document.getElementById('sports-match-overlay');
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const dataUrl = root.dataset.dataUrl;
  const eventsUrl = root.dataset.eventsUrl;
  if (!dataUrl || !eventsUrl) {
    return;
  }
  const overlayRoot = root;
  const overlayDataUrl = dataUrl;
  const overlayEventsUrl = eventsUrl;

  const config = {
    team: root.dataset.team === 'home' || root.dataset.team === 'away' ? root.dataset.team : 'both',
    showTeamName: root.dataset.teamName !== 'false',
    showTeamIcon: root.dataset.teamIcon !== 'false',
    showScore: root.dataset.score !== 'false',
    showStopwatch: root.dataset.stopwatch !== 'false',
    showPeriod: root.dataset.period !== 'false',
    showState: root.dataset.state !== 'false',
    periodWord: root.dataset.periodWord || 'Rodada',
  };
  const isDemo = root.dataset.matchId === 'demo';

  const stateLabels: Readonly<Record<string, string>> = {
    SCHEDULED: 'Agendada',
    CHECK_IN: 'Check-in',
    LIVE: 'Ao vivo',
    PAUSED: 'Pausada',
    AWAITING_REVIEW: 'Em revisão',
    CANCELED: 'Cancelada',
    DRAW: 'Empate',
    FINISHED: 'Finalizada',
  };

  let match: OverlayMatch | null = null;
  let requestInFlight = false;

  function elementId(side: OverlaySide, element: OverlayElement): string {
    return 'sports-match-overlay-' + side + '-' + element;
  }

  function teamFor(side: OverlaySide): OverlayTeam | null | undefined {
    return side === 'home' ? match?.homeTeam : match?.awayTeam;
  }

  function fallbackTeamName(side: OverlaySide): string {
    return side === 'home' ? 'Equipe da casa' : 'Equipe visitante';
  }

  function initials(name: string): string {
    const parts = String(name || '?')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return (
      parts
        .slice(0, 2)
        .map((part) => part.charAt(0))
        .join('') || '?'
    ).toLocaleUpperCase('pt-BR');
  }

  function formatElapsed(value: number): string {
    const totalSeconds = Math.floor(Math.max(0, Number(value) || 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  function overallElapsed(): number {
    const base = Number(match?.elapsedBeforePauseMs) || 0;
    const timerStartedAtUnixMs = match?.timerStartedAtUnixMs;
    const startedAt = Number(timerStartedAtUnixMs);
    const running =
      match?.state === 'LIVE' && timerStartedAtUnixMs != null && Number.isFinite(startedAt)
        ? Math.max(0, Date.now() - startedAt)
        : 0;
    return base + running;
  }

  function activePeriod(): number | null | undefined {
    return match?.scoreboard?.activePeriod ?? match?.scoreboard?.periods?.at(-1)?.number;
  }

  function applyMatch(nextMatch: unknown): void {
    if (!nextMatch || typeof nextMatch !== 'object') {
      return;
    }
    match = nextMatch as OverlayMatch;

    for (const side of ['home', 'away'] as const) {
      const teamElement = document.getElementById(elementId(side, 'team'));
      if (!(teamElement instanceof HTMLElement)) {
        continue;
      }
      teamElement.hidden = config.team !== 'both' && config.team !== side;
      const team = teamFor(side) || {};
      const teamName = team.name || fallbackTeamName(side);
      const nameElement = document.getElementById(elementId(side, 'name'));
      if (nameElement instanceof HTMLElement) {
        nameElement.textContent = teamName;
        nameElement.hidden = !config.showTeamName;
      }
      const scoreElement = document.getElementById(elementId(side, 'score'));
      if (scoreElement instanceof HTMLElement) {
        scoreElement.textContent = String(
          side === 'home' ? (match.scoreboard?.homeScore ?? 0) : (match.scoreboard?.awayScore ?? 0),
        );
        scoreElement.hidden = !config.showScore;
      }
      const iconElement = document.getElementById(elementId(side, 'icon'));
      if (iconElement instanceof HTMLElement) {
        iconElement.hidden = !config.showTeamIcon;
        const logoElement = document.getElementById(elementId(side, 'logo'));
        const placeholderElement = document.getElementById(elementId(side, 'icon-placeholder'));
        if (team.logoUrl && logoElement instanceof HTMLImageElement) {
          logoElement.src = team.logoUrl;
          logoElement.hidden = false;
          if (placeholderElement instanceof HTMLElement) {
            placeholderElement.hidden = true;
          }
        } else {
          if (logoElement instanceof HTMLImageElement) {
            logoElement.removeAttribute('src');
            logoElement.hidden = true;
          }
          if (placeholderElement instanceof HTMLElement) {
            placeholderElement.textContent = initials(teamName);
            placeholderElement.hidden = false;
          }
        }
      }
    }

    const stateElement = document.getElementById('sports-match-overlay-state');
    if (stateElement instanceof HTMLElement) {
      stateElement.textContent = stateLabels[match.state || ''] || match.state || '';
      stateElement.hidden = !config.showState;
    }

    const stopwatchElement = document.getElementById('sports-match-overlay-stopwatch');
    if (stopwatchElement instanceof HTMLElement) {
      stopwatchElement.textContent = formatElapsed(overallElapsed());
      stopwatchElement.hidden = !config.showStopwatch || match.overallTimerEnabled === false;
    }

    const periodElement = document.getElementById('sports-match-overlay-period');
    const periodNumber = activePeriod();
    if (periodElement instanceof HTMLElement) {
      periodElement.textContent = periodNumber == null ? '' : config.periodWord + ' ' + periodNumber;
      periodElement.hidden = !config.showPeriod || periodNumber == null;
    }
    overlayRoot.dataset.state = match.state || '';
  }

  async function refresh(): Promise<void> {
    if (requestInFlight) {
      return;
    }
    requestInFlight = true;
    try {
      const response = await fetch(overlayDataUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Overlay data request failed');
      }
      applyMatch(await response.json());
      overlayRoot.dataset.connection = 'connected';
    } catch {
      overlayRoot.dataset.connection = 'reconnecting';
    } finally {
      requestInFlight = false;
    }
  }

  const events = new EventSource(overlayEventsUrl);
  events.onmessage = () => {
    void refresh();
  };
  events.onerror = () => {
    overlayRoot.dataset.connection = 'reconnecting';
  };
  if (!isDemo) {
    window.setInterval(() => {
      void refresh();
    }, 20_000);
  }
  window.setInterval(() => {
    if (match) {
      const stopwatchElement = document.getElementById('sports-match-overlay-stopwatch');
      if (stopwatchElement instanceof HTMLElement && !stopwatchElement.hidden) {
        stopwatchElement.textContent = formatElapsed(overallElapsed());
      }
    }
  }, 1_000);
  void refresh();
}

export const OVERLAY_RUNTIME_SCRIPT = `(${initializeSportsMatchOverlay.toString()})();`;
