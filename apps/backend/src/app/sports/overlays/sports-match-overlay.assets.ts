export const OVERLAY_ASSET_BASE = '/api/sports/public/overlays/sports-match';

export const OVERLAY_STYLESHEET = String.raw`
:root {
  color-scheme: normal;
}

html,
body {
  width: max-content;
  min-width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent !important;
}

body {
  font-family: var(--sports-overlay-font-family, 'Inter Variable', Inter, system-ui, sans-serif);
}

[data-sports-match-overlay] {
  --sports-overlay-text: #fff;
  --sports-overlay-muted: rgba(255, 255, 255, .8);
  --sports-overlay-accent: #fff;
  --sports-overlay-font-family: 'Inter Variable', Inter, system-ui, sans-serif;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: clamp(.65rem, 2vw, 1.15rem);
  max-width: 100vw;
  padding: .2rem;
  color: var(--sports-overlay-text);
  font-family: var(--sports-overlay-font-family);
}

[data-sports-match-overlay] [hidden] {
  display: none !important;
}

.sports-overlay__team {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: .55rem;
  min-width: 0;
  max-width: min(34vw, 27rem);
}

.sports-overlay__icon,
.sports-overlay__logo,
.sports-overlay__icon-placeholder {
  width: clamp(2rem, 5vw, 3.4rem);
  height: clamp(2rem, 5vw, 3.4rem);
  flex: 0 0 auto;
}

.sports-overlay__icon {
  display: grid;
  place-items: center;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .55));
}

.sports-overlay__logo {
  object-fit: contain;
}

.sports-overlay__icon-placeholder {
  display: grid;
  place-items: center;
  border: 2px solid currentColor;
  border-radius: 50%;
  box-sizing: border-box;
  color: var(--sports-overlay-accent);
  font-size: clamp(.75rem, 2vw, 1.2rem);
  font-weight: 800;
  line-height: 1;
}

.sports-overlay__team-name {
  min-width: 0;
  overflow: hidden;
  color: var(--sports-overlay-text);
  font-size: clamp(.85rem, 2vw, 1.4rem);
  font-weight: 700;
  letter-spacing: -.02em;
  line-height: 1.05;
  text-overflow: ellipsis;
  text-shadow: 0 2px 4px rgba(0, 0, 0, .72);
  white-space: nowrap;
}

.sports-overlay__score {
  min-width: 1ch;
  color: var(--sports-overlay-text);
  font-size: clamp(2rem, 7vw, 4.6rem);
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  letter-spacing: -.06em;
  line-height: .85;
  text-shadow: 0 3px 6px rgba(0, 0, 0, .75);
}

.sports-overlay__center {
  display: grid;
  justify-items: center;
  gap: .16rem;
  min-width: max-content;
  text-align: center;
  text-shadow: 0 2px 4px rgba(0, 0, 0, .72);
}

.sports-overlay__state {
  color: var(--sports-overlay-muted);
  font-size: clamp(.65rem, 1.4vw, .9rem);
  font-weight: 800;
  letter-spacing: .08em;
  line-height: 1;
  text-transform: uppercase;
}

.sports-overlay__stopwatch {
  color: var(--sports-overlay-text);
  font-size: clamp(1rem, 2.4vw, 1.55rem);
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  line-height: 1;
}

.sports-overlay__period {
  color: var(--sports-overlay-muted);
  font-size: clamp(.7rem, 1.5vw, 1rem);
  line-height: 1;
}

@media (max-width: 520px) {
  [data-sports-match-overlay] {
    gap: .45rem;
  }

  .sports-overlay__team {
    gap: .35rem;
    max-width: 42vw;
  }

  .sports-overlay__team-name {
    max-width: 18vw;
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-sports-match-overlay] * {
    transition: none !important;
  }
}
`;

export const OVERLAY_RUNTIME_SCRIPT = String.raw`(() => {
  const root = document.querySelector('[data-sports-match-overlay]');
  if (!(root instanceof HTMLElement)) {
    return;
  }

  const dataUrl = root.dataset.dataUrl;
  const eventsUrl = root.dataset.eventsUrl;
  if (!dataUrl || !eventsUrl) {
    return;
  }

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

  const stateLabels = {
    SCHEDULED: 'Agendada',
    CHECK_IN: 'Check-in',
    LIVE: 'Ao vivo',
    PAUSED: 'Pausada',
    AWAITING_REVIEW: 'Em revisão',
    CANCELED: 'Cancelada',
    DRAW: 'Empate',
    FINISHED: 'Finalizada',
  };

  let match = null;
  let requestInFlight = false;

  function teamFor(side) {
    return side === 'home' ? match?.homeTeam : match?.awayTeam;
  }

  function fallbackTeamName(side) {
    return side === 'home' ? 'Equipe da casa' : 'Equipe visitante';
  }

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return (parts.slice(0, 2).map((part) => part.charAt(0)).join('') || '?').toLocaleUpperCase('pt-BR');
  }

  function formatElapsed(value) {
    const totalSeconds = Math.floor(Math.max(0, Number(value) || 0) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  function overallElapsed() {
    const base = Number(match?.elapsedBeforePauseMs) || 0;
    const startedAt = Number(match?.timerStartedAtUnixMs);
    const running = match?.state === 'LIVE' && Number.isFinite(startedAt)
      ? Math.max(0, Date.now() - startedAt)
      : 0;
    return base + running;
  }

  function activePeriod() {
    return match?.scoreboard?.activePeriod ?? match?.scoreboard?.periods?.at(-1)?.number ?? null;
  }

  function applyMatch(nextMatch) {
    if (!nextMatch || typeof nextMatch !== 'object') {
      return;
    }
    match = nextMatch;

    for (const side of ['home', 'away']) {
      const teamElement = root.querySelector('[data-side="' + side + '"]');
      if (!(teamElement instanceof HTMLElement)) {
        continue;
      }
      teamElement.hidden = config.team !== 'both' && config.team !== side;
      const team = teamFor(side) || {};
      const teamName = team.name || fallbackTeamName(side);
      const nameElement = teamElement.querySelector('[data-role="team-name"]');
      if (nameElement instanceof HTMLElement) {
        nameElement.textContent = teamName;
        nameElement.hidden = !config.showTeamName;
      }
      const scoreElement = teamElement.querySelector('[data-role="score"]');
      if (scoreElement instanceof HTMLElement) {
        scoreElement.textContent = String(side === 'home'
          ? (match.scoreboard?.homeScore ?? 0)
          : (match.scoreboard?.awayScore ?? 0));
        scoreElement.hidden = !config.showScore;
      }
      const iconElement = teamElement.querySelector('[data-role="icon"]');
      if (iconElement instanceof HTMLElement) {
        iconElement.hidden = !config.showTeamIcon;
        const logoElement = iconElement.querySelector('[data-role="logo"]');
        const placeholderElement = iconElement.querySelector('[data-role="placeholder"]');
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

    const stateElement = root.querySelector('[data-role="state"]');
    if (stateElement instanceof HTMLElement) {
      stateElement.textContent = stateLabels[match.state] || match.state || '';
      stateElement.hidden = !config.showState;
    }

    const stopwatchElement = root.querySelector('[data-role="stopwatch"]');
    if (stopwatchElement instanceof HTMLElement) {
      stopwatchElement.textContent = formatElapsed(overallElapsed());
      stopwatchElement.hidden = !config.showStopwatch || match.overallTimerEnabled === false;
    }

    const periodElement = root.querySelector('[data-role="period"]');
    const periodNumber = activePeriod();
    if (periodElement instanceof HTMLElement) {
      periodElement.textContent = periodNumber == null ? '' : config.periodWord + ' ' + periodNumber;
      periodElement.hidden = !config.showPeriod || periodNumber == null;
    }
    root.dataset.state = match.state || '';
  }

  async function refresh() {
    if (requestInFlight) {
      return;
    }
    requestInFlight = true;
    try {
      const response = await fetch(dataUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error('Overlay data request failed');
      }
      applyMatch(await response.json());
      root.dataset.connection = 'connected';
    } catch {
      root.dataset.connection = 'reconnecting';
    } finally {
      requestInFlight = false;
    }
  }

  const events = new EventSource(eventsUrl);
  events.onmessage = () => { void refresh(); };
  events.onerror = () => { root.dataset.connection = 'reconnecting'; };
  window.setInterval(() => { void refresh(); }, 20_000);
  window.setInterval(() => {
    if (match) {
      const stopwatchElement = root.querySelector('[data-role="stopwatch"]');
      if (stopwatchElement instanceof HTMLElement && !stopwatchElement.hidden) {
        stopwatchElement.textContent = formatElapsed(overallElapsed());
      }
    }
  }, 1_000);
  void refresh();
})();
`;
