import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { AuthSessionStoreService } from './auth-session-store.service';
import { AuthorizationStateService } from './authorization-state.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import { KeycloakM2mTokenService } from './keycloak-m2m-token.service';
import { AuthenticatedUserSyncService } from './authenticated-user-sync.service';
import { AuthorizationPolicyService } from '../authorization/authorization-policy.service';
import { redisProvider } from '../redis/redis.provider';

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
    redisProvider,
  ],
  exports: [KeycloakAuthService, KeycloakM2mTokenService, AuthenticatedUserSyncService, AuthorizationPolicyService],
})
export class AuthModule {}
