import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { LgpdDeletionRequestDto, LgpdUserRequestDto } from './dto';
import { LgpdService } from './lgpd.service';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('lgpd')
@ApiBearerAuth()
@Controller('lgpd')
export class LgpdController {
  constructor(
    private readonly keycloakAuthService: KeycloakAuthService,
    private readonly lgpdService: LgpdService,
  ) {}

  @Post('user-data')
  @RequireRoles('lgpd:read')
  @ApiOkResponse({ description: 'Event Manager user data grouped by category.' })
  userData(@Req() request: RequestWithUser, @Body() body: LgpdUserRequestDto) {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['lgpd:read'],
    });

    return this.lgpdService.collectUserData(body);
  }

  @Post('deletion/schedule')
  @RequireRoles('lgpd:delete')
  @ApiOkResponse({ description: 'Event Manager user data was soft-deleted.' })
  scheduleDeletion(@Req() request: RequestWithUser, @Body() body: LgpdDeletionRequestDto) {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['lgpd:delete'],
    });

    return this.lgpdService.scheduleDeletion(body);
  }

  @Post('deletion/delete')
  @RequireRoles('lgpd:delete')
  @ApiOkResponse({ description: 'Event Manager retained user data was permanently deleted.' })
  hardDelete(@Req() request: RequestWithUser, @Body() body: LgpdDeletionRequestDto) {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['lgpd:delete'],
    });

    return this.lgpdService.hardDelete(body);
  }
}

