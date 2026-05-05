import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthResolver } from './auth.resolver';
import { KeycloakAuthService } from './keycloak-auth.service';

@Module({
  controllers: [AuthController],
  providers: [KeycloakAuthService, AuthResolver],
  exports: [KeycloakAuthService],
})
export class AuthModule {}
