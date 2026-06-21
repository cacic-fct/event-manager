import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { AuthSessionStoreService } from './auth-session-store.service';
import { AuthorizationStateService } from './authorization-state.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import { KeycloakM2mTokenService } from './keycloak-m2m-token.service';
import { AuthenticatedUserSyncService } from './authenticated-user-sync.service';
import { getRedisConnectionOptions } from '../weather/redis-connection';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';

@Module({
  controllers: [AuthController],
  providers: [
    KeycloakAuthService,
    KeycloakM2mTokenService,
    AuthenticatedUserSyncService,
    AuthorizationPolicyService,
    AuthSessionStoreService,
    AuthorizationStateService,
    AuthResolver,
    {
      provide: Redis,
      useFactory: () => new Redis(getRedisConnectionOptions()),
    },
  ],
  exports: [KeycloakAuthService, KeycloakM2mTokenService, AuthenticatedUserSyncService, AuthorizationPolicyService],
})
export class AuthModule {}
