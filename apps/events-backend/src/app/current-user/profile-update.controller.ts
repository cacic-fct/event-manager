import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { CurrentUserContextService } from './context.service';
import { AccountProfileUpdateAcknowledgementDto, AccountProfileUpdateDto } from './profile-update.dto';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('account-profile')
@ApiBearerAuth()
@Controller('internal/account-profile')
export class AccountProfileUpdateController {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {}

  @Post('updated')
  @RequireRoles('account-profile:write')
  @ApiOkResponse({ type: AccountProfileUpdateAcknowledgementDto })
  async updated(
    @Req() request: RequestWithUser,
    @Body() body: AccountProfileUpdateDto,
  ): Promise<AccountProfileUpdateAcknowledgementDto> {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['account-profile:write'],
    });

    const { user, person } = await this.currentUserContext.syncProfileUpdate(body);

    return {
      status: 'success',
      userId: user?.id ?? null,
      personId: person?.id ?? null,
    };
  }
}
