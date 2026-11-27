import { Body, Controller, Get, Param, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../auth/decorators/public.decorator';
import { McpAdminSessionGuard } from '../mcp-admin-session.guard';
import { McpAdminOperationInterceptor } from '../mcp-admin-operation.interceptor';
import type { McpAuthenticatedRequest } from '../shared/principal';
import { mcpIdSchema, parseMcpInput } from '../shared/schemas';
import { AdminMcpCommandService } from './command-service';
import { adminDelegationSchema, commandDecisionSchema, commandReviewSchema } from './schemas';

@ApiTags('Admin MCP operations')
@ApiCookieAuth()
@Public()
@UseGuards(McpAdminSessionGuard)
@UseInterceptors(McpAdminOperationInterceptor)
@Controller('admin/mcp/operations')
export class AdminMcpOperationsController {
  constructor(private readonly commands: AdminMcpCommandService) {}

  @Get('catalog')
  @ApiOperation({ summary: 'Consultar operações administrativas explicitamente disponíveis para MCP.' })
  @ApiResponse({ status: 200, schema: { example: [] } })
  catalog() {
    return this.commands.catalog();
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Verificar candidatos e indisponibilidades do catálogo contra o schema atual.' })
  @ApiResponse({ status: 200, schema: { example: { candidates: 238, available: 238, unavailable: [] } } })
  coverage() {
    return this.commands.coverage();
  }

  @Get('delegations')
  @ApiOperation({ summary: 'Consultar delegações de operações da própria conta.' })
  @ApiResponse({ status: 200, schema: { example: [] } })
  delegations(@Req() req: McpAuthenticatedRequest) {
    return this.commands.delegations(req.user);
  }

  @Post('delegations')
  @ApiOperation({ summary: 'Autorizar operações e escopo explícitos, sem conceder permissões de negócio.' })
  @ApiBody({
    description: 'Substitua expiresAt por uma data futura, no máximo 24 horas após o envio.',
    schema: {
      example: {
        clientId: 'approved-client',
        operations: ['createSportsTeam'],
        scope: { mode: 'ALL_AUTHORIZED' },
        personalData: false,
        expiresAt: '2026-11-20T23:00:00Z',
        maxProposals: 5,
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Delegação criada.' })
  create(@Req() req: McpAuthenticatedRequest, @Body() body: unknown) {
    return this.commands.createDelegation(req.user, parseMcpInput(adminDelegationSchema, body));
  }

  @Post('delegations/:id/revoke')
  @ApiOperation({ summary: 'Revogar uma delegação administrativa própria.' })
  @ApiBody({ schema: { example: {} } })
  @ApiResponse({ status: 201, schema: { example: { success: true } } })
  async revoke(@Req() req: McpAuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    parseMcpInput(z.strictObject({}), body);
    await this.commands.revoke(req.user, parseMcpInput(mcpIdSchema, id));
    return { success: true };
  }

  @Get('proposals')
  @ApiOperation({ summary: 'Consultar fila de comandos administrativos da própria conta.' })
  @ApiResponse({ status: 200, schema: { example: { items: [], hasMore: false } } })
  proposals(@Req() req: McpAuthenticatedRequest, @Query('page') page = '0') {
    return this.commands.list(req.user, parseMcpInput(z.coerce.number().int().min(0).max(100), page));
  }

  @Post('proposals/:id/review')
  @ApiOperation({ summary: 'Validar edição humana e assinar a prévia final imutável de execução.' })
  @ApiBody({
    schema: {
      example: { arguments: { input: { name: 'Nome revisado' } }, expectedFingerprint: 'a'.repeat(64) },
    },
  })
  @ApiResponse({ status: 201, description: 'Prévia normalizada e assinada.' })
  review(@Req() req: McpAuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    return this.commands.review(req.user, parseMcpInput(mcpIdSchema, id), parseMcpInput(commandReviewSchema, body));
  }

  @Post('proposals/:id/decision')
  @ApiOperation({ summary: 'Aprovar uma única tentativa da operação revisada, ou recusar sem executá-la.' })
  @ApiBody({ schema: { example: { decision: 'REJECT', expectedFingerprint: 'a'.repeat(64) } } })
  @ApiResponse({
    status: 201,
    description:
      'Confira state para saber o resultado. UNCERTAIN exige consultar o histórico, sem tentar executar novamente.',
    schema: { example: { success: true, state: 'REJECTED' } },
  })
  async decide(@Req() req: McpAuthenticatedRequest, @Param('id') id: string, @Body() body: unknown) {
    const state = await this.commands.decide(
      req.user,
      parseMcpInput(mcpIdSchema, id),
      parseMcpInput(commandDecisionSchema, body),
    );
    return { success: true, state };
  }
}
