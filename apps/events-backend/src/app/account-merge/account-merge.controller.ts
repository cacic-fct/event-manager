import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequireRoles } from '../auth/decorators/require-roles.decorator';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { KeycloakAuthService } from '../auth/keycloak-auth.service';
import { AccountMergeService } from './account-merge.service';
import {
  AccountMergeAcknowledgementDto,
  AccountMergeNotificationDto,
  AccountMergeScoreRequestDto,
  AccountMergeScoreResponseDto,
} from './dto';

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
};

@ApiTags('account-merge')
@ApiBearerAuth()
@Controller('account-merge')
export class AccountMergeController {
  constructor(
    private readonly accountMergeService: AccountMergeService,
    private readonly keycloakAuthService: KeycloakAuthService,
  ) {}

  @Post('score')
  @RequireRoles('account-merge:score')
  @ApiOkResponse({ type: AccountMergeScoreResponseDto })
  async score(
    @Req() request: RequestWithUser,
    @Body() body: AccountMergeScoreRequestDto,
  ): Promise<AccountMergeScoreResponseDto> {
    this.keycloakAuthService.assertMachineToMachinePrincipal(request.user, {
      requiredRoles: ['account-merge:score'],
    });

    return this.accountMergeService.scoreAccountMergeCandidates(body);
  }

  @Post('merge')
  @RequireRoles('account-merge:write')
  @ApiOkResponse({ type: AccountMergeAcknowledgementDto })
  async merge(
    @Req() request: RequestWithUser,
    @Body() body: AccountMergeNotificationDto,
  ): Promise<AccountMergeAcknowledgementDto> {
    const user = this.keycloakAuthService.assertMachineToMachinePrincipal(
      request.user,
      { requiredRoles: ['account-merge:write'] },
    );

    return this.accountMergeService.acknowledgeAccountMerge(
      body,
      this.readClientId(user),
    );
  }

  private readClientId(user: AuthenticatedUser): string | null {
    const clientId = user.claims['azp'] ?? user.claims['client_id'];
    return typeof clientId === 'string' && clientId.trim()
      ? clientId.trim()
      : (user.sub ?? null);
  }
}
