export type LivestreamProvider = 'YOUTUBE' | 'TWITCH' | 'GENERAL';

const youtubeCodePattern = /^[A-Za-z0-9_-]+$/;
const twitchChannelPattern = /^[A-Za-z0-9_]{1,25}$/;
const reservedTwitchPaths = new Set([
  'directory', 'downloads', 'jobs', 'login', 'logout', 'p', 'search', 'settings',
  'signup', 'subscriptions', 'turbo', 'videos', 'wallet',
]);

function providerUrl(value: string): URL | null {
  try {
    let candidate = value;
    if (value.startsWith('//')) {
      candidate = `https:${value}`;
    } else if (/^[\w.-]+\.[a-z]+\//i.test(value)) {
      candidate = `https://${value}`;
    }
    const url = new URL(candidate);
    const isWebUrl = url.protocol === 'https:' || url.protocol === 'http:';
    return isWebUrl && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

/** Extract a video identifier without storing tracking parameters or a provider URL. */
export function normalizeYoutubeCode(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (youtubeCodePattern.test(trimmed)) {
    return trimmed;
  }
  const url = providerUrl(trimmed);
  if (!url) {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);
  let code: string | null = null;
  if (hostname === 'youtu.be' && segments.length === 1) {
    code = segments[0];
  } else if (
    ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
      'youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(hostname)
  ) {
    if (url.pathname === '/watch') {
      code = url.searchParams.get('v');
    } else if (segments.length === 2 && ['live', 'embed', 'shorts'].includes(segments[0])) {
      code = segments[1];
    }
  }
  return code && youtubeCodePattern.test(code) ? code : null;
}

/** Twitch channels are logins, never video/clip IDs or arbitrary Twitch routes. */
export function normalizeTwitchChannel(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  let channel = trimmed;
  if (!twitchChannelPattern.test(channel)) {
    const url = providerUrl(trimmed);
    if (!url || !['twitch.tv', 'www.twitch.tv', 'm.twitch.tv', 'player.twitch.tv'].includes(url.hostname.toLowerCase())) {
      return null;
    }
    const segments = url.pathname.split('/').filter(Boolean);
    if (url.hostname.toLowerCase() === 'player.twitch.tv') {
      channel = url.searchParams.get('channel') ?? '';
    } else if (segments.length === 1 ||
      (segments.length === 2 && ['about', 'schedule', 'videos', 'clips'].includes(segments[1]))) {
      channel = segments[0];
    } else {
      return null;
    }
  }
  channel = channel.toLowerCase();
  return twitchChannelPattern.test(channel) && !reservedTwitchPaths.has(channel) ? channel : null;
}

export function normalizeLivestreamValue(
  provider: LivestreamProvider | null | undefined,
  value: string | null | undefined,
): string | null {
  if (provider === 'YOUTUBE') {
    return normalizeYoutubeCode(value);
  }
  if (provider === 'TWITCH') {
    return normalizeTwitchChannel(value);
  }
  if (!value?.trim()) {
    return null;
  }
  const url = providerUrl(value.trim());
  return url?.protocol === 'https:' ? url.toString() : null;
}

/** Keep outbound links usable for both identifier storage and legacy URL records. */
export function livestreamExternalUrl(
  provider: LivestreamProvider | null | undefined,
  value: string | null | undefined,
): string | null {
  const identifier = normalizeLivestreamValue(provider, value);
  if (!identifier) {
    return null;
  }
  if (provider === 'YOUTUBE') {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(identifier)}`;
  }
  if (provider === 'TWITCH') {
    return `https://www.twitch.tv/${encodeURIComponent(identifier)}`;
  }
  return identifier;
}
