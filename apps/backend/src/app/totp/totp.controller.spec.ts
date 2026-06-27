import { BadRequestException } from '@nestjs/common';
import { AUTH_SESSION_COOKIE_NAME } from '../auth/auth.constants';
import type { KeycloakAuthService } from '../auth/keycloak-auth.service';
import type { AccountManagerTotpService } from './account-manager-totp.service';
import { TotpController } from './totp.controller';

describe('TotpController', () => {
  let accountManagerTotp: Pick<jest.Mocked<AccountManagerTotpService>, 'relaySeed'>;
  let keycloakAuth: Pick<jest.Mocked<KeycloakAuthService>, 'getSessionExpiration'>;
  let controller: TotpController;

  beforeEach(() => {
    accountManagerTotp = {
      relaySeed: jest.fn().mockResolvedValue({
        userId: 'keycloak-subject',
        primaryEmail: 'joao.silva@unesp.br',
        seed: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
        algorithm: 'SHA512',
        digits: 6,
        periodSeconds: 30,
        serverTime: '2026-06-26T16:00:00.000Z',
      }),
    };
    keycloakAuth = {
      getSessionExpiration: jest.fn().mockResolvedValue(1_798_748_399_000),
    };
    controller = new TotpController(
      accountManagerTotp as unknown as AccountManagerTotpService,
      keycloakAuth as unknown as KeycloakAuthService,
    );
  });

  it('relays the current user seed and attaches the Event Manager session expiration', async () => {
    await expect(
      controller.relayCurrentUserSeed({
        user: {
          sub: 'keycloak-subject',
        },
        cookies: {
          [AUTH_SESSION_COOKIE_NAME]: 'session-id',
        },
        headers: {},
      } as never),
    ).resolves.toEqual({
      userId: 'keycloak-subject',
      primaryEmail: 'joao.silva@unesp.br',
      seed: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      algorithm: 'SHA512',
      digits: 6,
      periodSeconds: 30,
      serverTime: '2026-06-26T16:00:00.000Z',
      sessionExpiresAt: 1_798_748_399_000,
    });

    expect(keycloakAuth.getSessionExpiration).toHaveBeenCalledWith('session-id');
    expect(accountManagerTotp.relaySeed).toHaveBeenCalledWith('keycloak-subject');
  });

  it('can read the session cookie from the raw cookie header', async () => {
    await controller.relayCurrentUserSeed({
      user: {
        sub: 'keycloak-subject',
      },
      headers: {
        cookie: `${AUTH_SESSION_COOKIE_NAME}=session%20id; other=value`,
      },
    } as never);

    expect(keycloakAuth.getSessionExpiration).toHaveBeenCalledWith('session id');
  });

  it('rejects relay when the request is missing a user subject', async () => {
    await expect(
      controller.relayCurrentUserSeed({
        user: {},
        cookies: {
          [AUTH_SESSION_COOKIE_NAME]: 'session-id',
        },
        headers: {},
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(accountManagerTotp.relaySeed).not.toHaveBeenCalled();
  });

  it('rejects relay when the local session is missing or expired', async () => {
    keycloakAuth.getSessionExpiration.mockResolvedValue(null);

    await expect(
      controller.relayCurrentUserSeed({
        user: {
          sub: 'keycloak-subject',
        },
        cookies: {
          [AUTH_SESSION_COOKIE_NAME]: 'expired-session',
        },
        headers: {},
      } as never),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(accountManagerTotp.relaySeed).not.toHaveBeenCalled();
  });
});
