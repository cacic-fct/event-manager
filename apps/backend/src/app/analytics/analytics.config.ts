export const SENTRY_TUNNEL_TARGETS = {
  admin: {
    envelopeUrl:
      'https://glitchtip.cacic.dev.br/api/2/envelope/?sentry_version=7&sentry_key=b787190b5ac546eb867e793b84d2b4b2',
  },
  public: {
    envelopeUrl:
      'https://glitchtip.cacic.dev.br/api/1/envelope/?sentry_version=7&sentry_key=44b2480fd6cd4402b61590135a093fd6',
  },
} as const;

export type SentryTunnelProject = keyof typeof SENTRY_TUNNEL_TARGETS;
