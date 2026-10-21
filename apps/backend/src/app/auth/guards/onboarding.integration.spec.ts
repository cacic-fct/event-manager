import { Controller, Get, Post, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Test } from '@nestjs/testing';
import axios, { type AxiosInstance } from 'axios';
import { AuthorizationPolicyService } from '../../authorization/authorization-policy.service';
import { TotpController } from '../../totp/totp.controller';
import { AccountManagerTotpService } from '../../totp/account-manager-totp.service';
import { AUTH_SESSION_COOKIE_NAME } from '../auth.constants';
import { AllowNonOnboarded } from '../decorators/allow-non-onboarded.decorator';
import { Public } from '../decorators/public.decorator';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../keycloak-auth.service';
import { KeycloakScopeGuard } from './keycloak-scope.guard';

const { jest } = import.meta;

const protectedHandler = jest.fn(() => true);

@Controller('onboarding-probe')
class OnboardingProbeController {
  @Post()
  protectedOperation(): boolean {
    return protectedHandler();
  }

  @Get('identity')
  @AllowNonOnboarded()
  identity(): boolean {
    return true;
  }

  @Get('public')
  @Public()
  catalog(): boolean {
    return true;
  }
}

@Resolver()
class OnboardingProbeResolver {
  @Query(() => Boolean)
  onboardingProbe(): boolean {
    return protectedHandler();
  }

  @Mutation(() => Boolean)
  updateOnboardingProbe(): boolean {
    return protectedHandler();
  }
}

describe('onboarding enforcement over HTTP and GraphQL', () => {
  let app: INestApplication;
  let http: AxiosInstance;
  const auth = {
    authenticateAccessToken: jest.fn(),
    authenticateSession: jest.fn(),
    getSessionExpiration: jest.fn(),
    assertClientRoles: jest.fn(),
  };
  const relaySeed = jest.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        GraphQLModule.forRoot<ApolloDriverConfig>({
          driver: ApolloDriver,
          autoSchemaFile: true,
          useGlobalPrefix: true,
          context: ({ req }: { req: unknown }) => ({ req }),
        }),
      ],
      controllers: [OnboardingProbeController, TotpController],
      providers: [
        OnboardingProbeResolver,
        { provide: APP_GUARD, useClass: KeycloakScopeGuard },
        { provide: KeycloakAuthService, useValue: auth },
        {
          provide: AuthorizationPolicyService,
          useValue: {
            assertPermissions: jest.fn(),
            buildResourceContext: jest.fn(() => ({})),
          },
        },
        { provide: AccountManagerTotpService, useValue: { relaySeed } },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    http = axios.create({ baseURL: await app.getUrl(), validateStatus: () => true });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    auth.authenticateAccessToken.mockResolvedValue(principal(false));
    auth.authenticateSession.mockResolvedValue(principal(false));
  });

  afterAll(async () => app?.close());

  const credentialHeaders = [
    { authorization: 'Bearer verified-token' },
    { cookie: `${AUTH_SESSION_COOKIE_NAME}=server-session` },
  ];

  it.each(credentialHeaders)('ignores forged browser claims in REST requests with %p', async (credentials) => {
    const response = await http.post(
      '/api/onboarding-probe?is_onboarded=true',
      { is_onboarded: true, user: { claims: { is_onboarded: true } } },
      { headers: { ...credentials, 'x-onboarding-complete': 'true', 'x-event-audience': 'public' } },
    );
    expect(response.status).toBe(403);
    expect(response.data.code).toBe('ONBOARDING_REQUIRED');
    expect(protectedHandler).not.toHaveBeenCalled();
  });

  it.each([undefined, null, false, 'false', 1, 'TRUE', ['true'], { value: true }])(
    'fails closed for onboarding claim %p',
    async (claim) => {
      auth.authenticateAccessToken.mockResolvedValue(principal(claim));
      const response = await http.post('/api/onboarding-probe', {}, { headers: credentialHeaders[0] });
      expect(response.status).toBe(403);
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it.each(['service-account-student', 'service-account-event-manager'])(
    'rejects username exemption %s',
    async (username) => {
      auth.authenticateAccessToken.mockResolvedValue({
        ...principal(false),
        preferredUsername: username,
        claims: { azp: 'event-manager' },
      });
      const response = await http.post('/api/onboarding-probe', {}, { headers: credentialHeaders[0] });
      expect(response.status).toBe(403);
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it.each(credentialHeaders)(
    'blocks direct GraphQL queries, aliases, fragments and mutations with %p',
    async (headers) => {
      for (const query of [
        'query { alias: onboardingProbe }',
        'query { ...Protected } fragment Protected on Query { onboardingProbe }',
        'mutation { updateOnboardingProbe }',
      ]) {
        const response = await http.post('/api/graphql', { query }, { headers });
        expect(response.status).toBe(200);
        expect(response.data.errors[0].extensions.originalError.code).toBe('ONBOARDING_REQUIRED');
      }
      expect(protectedHandler).not.toHaveBeenCalled();
    },
  );

  it('blocks wallet seed retrieval before it reaches Account Manager', async () => {
    const response = await http.get('/api/totp/seed', { headers: credentialHeaders[1] });
    expect(response.status).toBe(403);
    expect(response.data.code).toBe('ONBOARDING_REQUIRED');
    expect(relaySeed).not.toHaveBeenCalled();
    expect(auth.getSessionExpiration).not.toHaveBeenCalled();
  });

  it('keeps identity recovery authenticated and anonymous browsing public', async () => {
    expect((await http.get('/api/onboarding-probe/identity', { headers: credentialHeaders[1] })).status).toBe(200);
    expect((await http.get('/api/onboarding-probe/identity')).status).toBe(401);
    expect((await http.get('/api/onboarding-probe/public')).status).toBe(200);
  });

  it.each([true, 'true'])('allows REST and GraphQL after trusted completion becomes %p', async (claim) => {
    auth.authenticateAccessToken.mockResolvedValue(principal(claim));
    expect((await http.post('/api/onboarding-probe', {}, { headers: credentialHeaders[0] })).status).toBe(201);
    const response = await http.post(
      '/api/graphql',
      { query: 'mutation { updateOnboardingProbe }' },
      {
        headers: credentialHeaders[0],
      },
    );
    expect(response.data.errors).toBeUndefined();
    expect(response.data.data.updateOnboardingProbe).toBe(true);
    expect(protectedHandler).toHaveBeenCalledTimes(2);
  });
});

function principal(claim: unknown): AuthenticatedUser {
  return {
    sub: 'user-1',
    preferredUsername: 'student',
    token: 'verified-token',
    realm_access: { roles: [] },
    roles: [],
    roleSet: new Set(),
    permissions: [],
    permissionSet: new Set(),
    oidcScopes: [],
    oidcScopeSet: new Set(),
    scopes: [],
    scopeSet: new Set(),
    claims: { is_onboarded: claim },
  };
}
