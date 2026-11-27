import type { McpAdminSettings } from '@cacic-fct/event-manager-mcp-contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../auth/decorators/public.decorator';
import { type McpAuthenticatedRequest } from './shared/principal';
import { McpAdminAccessService } from './mcp-admin-access.service';
import { McpAdminConfig } from './mcp-admin.config';
import { McpAdminMaintenanceService } from './mcp-admin-maintenance.service';
import { McpAdminProposalsService } from './mcp-admin-proposals.service';
import { McpAdminSessionGuard } from './mcp-admin-session.guard';
import { McpAdminOperationInterceptor } from './mcp-admin-operation.interceptor';
import { mcpDecisionSchema, mcpDelegationInputSchema, mcpEventReviewSchema } from './mcp-admin.schemas';
import { mcpIdSchema, parseMcpInput } from './shared/schemas';

@ApiTags('Admin MCP')
@ApiCookieAuth()
@Public()
@UseGuards(McpAdminSessionGuard)
@UseInterceptors(McpAdminOperationInterceptor)
@Controller('admin/mcp')
export class McpAdminController {
  constructor(
    private readonly config: McpAdminConfig,
    private readonly access: McpAdminAccessService,
    private readonly proposals: McpAdminProposalsService,
    private readonly maintenance: McpAdminMaintenanceService,
  ) {}

  @Get('settings')
  @ApiOperation({ summary: 'Consultar configuração MCP da própria conta.' })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        enabled: false,
        proposalsEnabled: false,
        resourceUrl: 'http://localhost:3000/api/mcp/admin',
        clients: [],
      },
    },
  })
  settings(): McpAdminSettings {
    return {
      enabled: this.config.enabled,
      proposalsEnabled: this.config.proposalsEnabled,
      resourceUrl: this.config.resourceUrl,
      clients: this.config.allowedClients.map((id) => ({ id, name: id })),
    };
  }

  @Get('delegations')
  @ApiOperation({ summary: 'Listar até 50 delegações da própria conta.' })
  @ApiResponse({ status: 200, schema: { example: [] } })
  delegations(@Req() request: McpAuthenticatedRequest) {
    return this.access.list(request.user);
  }

  @Post('delegations')
  @ApiOperation({ summary: 'Delegar capacidades limitadas a eventos específicos por até 24 horas.' })
  @ApiBody({
    schema: {
      example: {
        clientId: 'cacic-event-manager-mcp-dev',
        eventIds: ['00000000-0000-4000-8000-000000000001'],
        capabilities: ['EVENT_READ'],
        expiresAt: '2026-11-19T23:00:00Z',
        maxProposals: 5,
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Delegação criada; nenhuma permissão de negócio é concedida.' })
  createDelegation(@Req() request: McpAuthenticatedRequest, @Body() body: unknown) {
    return this.access.create(request.user, parseMcpInput(mcpDelegationInputSchema, body));
  }

  @Post('delegations/:id/revoke')
  @ApiOperation({ summary: 'Revogar imediatamente uma delegação da própria conta.' })
  @ApiBody({ schema: { example: {} } })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  async revokeDelegation(@Req() request: McpAuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    parseMcpInput(z.strictObject({}), body);
    await this.access.revoke(request.user, parseMcpInput(mcpIdSchema, id));
    return { success: true };
  }

  @Get('proposals')
  @ApiOperation({
    summary: 'Consultar fila de propostas próprias, filtrada pelas permissões atuais antes da paginação.',
  })
  @ApiResponse({ status: 200, schema: { example: { items: [], hasMore: false } } })
  listProposals(@Req() request: McpAuthenticatedRequest, @Query('page') page = '0', @Query('id') id?: string) {
    const parsedPage = parseMcpInput(z.coerce.number().int().min(0).max(100), page);
    return this.proposals.list(request.user, parsedPage, id === undefined ? undefined : parseMcpInput(mcpIdSchema, id));
  }

  @Post('proposals/:id/decision')
  @ApiOperation({ summary: 'Decidir uma proposta; a aprovação aplica a revisão confirmada uma única vez.' })
  @ApiBody({ schema: { example: { decision: 'APPROVE', expectedUpdatedAt: '2026-11-19T12:00:00Z' } } })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  @ApiResponse({ status: 409, description: 'Proposta expirada, já decidida ou evento alterado.' })
  async decideProposal(@Req() request: McpAuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const input = parseMcpInput(mcpDecisionSchema, body);
    const eventId = await this.proposals.decide(request.user, parseMcpInput(mcpIdSchema, id), input);
    // Committed business state and its audit remain successful if projections need retry.
    if (eventId) await this.maintenance.flush(eventId).catch(() => undefined);
    return { success: true };
  }

  @Post('proposals/:id/review')
  @HttpCode(200)
  @ApiOperation({ summary: 'Validar campos escolhidos e preparar a comparação final para a confirmação web.' })
  @ApiBody({
    schema: {
      example: {
        expectedOperation: 'EVENT_CONTENT',
        expectedUpdatedAt: '2026-11-19T12:00:00Z',
        selections: [{ field: 'name' }, { field: 'description', value: 'Descrição revisada.' }],
      },
    },
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        token: '1795090200000.signature',
        changes: [{ field: 'name', label: 'Nome', before: 'Nome anterior', after: 'Nome revisado' }],
        approvalEffects: 'Somente os campos exibidos serão alterados.',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'Proposta expirada, já decidida ou evento alterado.' })
  prepareProposalReview(@Req() request: McpAuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const input = parseMcpInput(mcpEventReviewSchema, body);
    return this.proposals.prepareReview(request.user, parseMcpInput(mcpIdSchema, id), input);
  }
}
