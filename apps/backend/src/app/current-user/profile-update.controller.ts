import { Body, Controller, Post, Req } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { CurrentUserContextService } from './context.service';
import { AccountProfileUpdateAcknowledgementDto, AccountProfileUpdateDto } from './profile-update.dto';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('Internal M2M')
@ApiBearerAuth()
@Controller('internal/account-profile')
export class AccountProfileUpdateController {
  constructor(
    private readonly currentUserContext: CurrentUserContextService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {}

  @Post('updated')
  @RequireRoles('account-profile:write')
  @ApiOperation({
    summary: 'Synchronize an account profile update',
    description:
      'Internal machine-to-machine endpoint used by the account/profile system to notify the events backend that a user profile changed. This endpoint is not intended for public frontend use or third-party developer integrations. The caller must have the account-profile:write role.',
  })
  @ApiBody({
    type: AccountProfileUpdateDto,
    description:
      'Profile update payload emitted by the account/profile backend. The events backend uses it to synchronize its local user/person projection.',
  })
  @ApiOkResponse({
    type: AccountProfileUpdateAcknowledgementDto,
    description:
      'Profile update accepted and the local user/person projection was synchronized when matching records were found or created.',
  })
  @ApiUnauthorizedResponse({
    description: 'Returned when the request does not include a valid service access token.',
  })
  @ApiForbiddenResponse({
    description:
      'Returned when the authenticated principal is not a machine-to-machine principal or does not have the required account-profile:write role.',
  })
  @ApiBadRequestResponse({
    description: 'Returned when the profile update payload is invalid or cannot be synchronized.',
  })
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
