import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { AuthSessionStoreService } from './auth-session-store.service';
import { AuthorizationStateService } from './authorization-state.service';
import { KeycloakAuthService } from './keycloak-auth.service';
import { AuthenticatedUserSyncService } from './authenticated-user-sync.service';
import { getRedisConnectionOptions } from '../weather/redis-connection';

@Module({
  controllers: [AuthController],
  providers: [
    KeycloakAuthService,
    AuthenticatedUserSyncService,
    AuthSessionStoreService,
    AuthorizationStateService,
    AuthResolver,
    {
      provide: Redis,
      useFactory: () => new Redis(getRedisConnectionOptions()),
    },
  ],
  exports: [KeycloakAuthService, AuthenticatedUserSyncService],
})
export class AuthModule {}
